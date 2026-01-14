import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * 串口监视器 - 使用终端方式实现
 * 通过在 VS Code 终端中运行串口监控命令来显示日志
 */
export class SerialMonitor {
    private terminal: vscode.Terminal | undefined;
    private statusBarItem: vscode.StatusBarItem;
    private isConnected: boolean = false;
    private currentPort: string = '';
    private currentBaudRate: number = 115200;

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            90
        );
        this.statusBarItem.command = 'stm32.serial.toggle';
        this.updateStatusBar();
        this.statusBarItem.show();

        // 监听终端关闭事件
        vscode.window.onDidCloseTerminal(t => {
            if (t === this.terminal) {
                this.terminal = undefined;
                this.isConnected = false;
                this.updateStatusBar();
            }
        });
    }

    private updateStatusBar() {
        if (this.isConnected) {
            this.statusBarItem.text = `$(plug) ${this.currentPort} @ ${this.currentBaudRate}`;
            this.statusBarItem.tooltip = '点击断开串口';
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        } else {
            this.statusBarItem.text = '$(plug) 串口';
            this.statusBarItem.tooltip = '点击连接串口';
            this.statusBarItem.backgroundColor = undefined;
        }
    }

    getStatusBarItem(): vscode.StatusBarItem {
        return this.statusBarItem;
    }

    /**
     * 列出可用的串口
     */
    async listPorts(): Promise<string[]> {
        const ports: string[] = [];
        
        // Windows: 检查 COM1-COM256
        if (process.platform === 'win32') {
            for (let i = 1; i <= 256; i++) {
                const portName = `COM${i}`;
                // 使用 mode 命令检测端口是否存在
                try {
                    const { exec } = require('child_process');
                    await new Promise<void>((resolve) => {
                        exec(`mode ${portName}`, { timeout: 500 }, (error: any) => {
                            if (!error) {
                                ports.push(portName);
                            }
                            resolve();
                        });
                    });
                } catch {
                    // 忽略错误
                }
            }
        }
        
        return ports;
    }

    /**
     * 快速列出串口
     */
    async listPortsQuick(): Promise<{port: string, description: string}[]> {
        return new Promise((resolve) => {
            const { exec } = require('child_process');
            
            if (process.platform === 'win32') {
                // 方法1: 使用 .NET SerialPort.GetPortNames() - 最可靠
                const cmd = `powershell -Command "[System.IO.Ports.SerialPort]::GetPortNames() | ForEach-Object { $_ }"`;
                exec(cmd, { timeout: 5000 }, (error: any, stdout: string) => {
                    if (!error && stdout.trim()) {
                        const ports = stdout.trim().split('\n')
                            .filter(p => p.trim())
                            .map(p => ({ port: p.trim(), description: '' }));
                        
                        if (ports.length > 0) {
                            // 尝试获取设备描述
                            this.getPortDescriptions(ports).then(resolve);
                            return;
                        }
                    }
                    
                    // 方法2: 使用注册表
                    const regCmd = `powershell -Command "Get-ItemProperty -Path 'HKLM:\\HARDWARE\\DEVICEMAP\\SERIALCOMM' -ErrorAction SilentlyContinue | ForEach-Object { $_.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' } | ForEach-Object { $_.Value } }"`;
                    exec(regCmd, { timeout: 5000 }, (error2: any, stdout2: string) => {
                        if (!error2 && stdout2.trim()) {
                            const ports = stdout2.trim().split('\n')
                                .filter(p => p.trim())
                                .map(p => ({ port: p.trim(), description: '' }));
                            if (ports.length > 0) {
                                this.getPortDescriptions(ports).then(resolve);
                                return;
                            }
                        }
                        
                        // 备用：返回空列表
                        resolve([]);
                    });
                });
            } else {
                // Linux/Mac
                exec('ls /dev/tty* 2>/dev/null | grep -E "(USB|ACM|usbserial|serial)"', { timeout: 2000 }, (error: any, stdout: string) => {
                    if (error || !stdout.trim()) {
                        resolve([]);
                    } else {
                        const ports = stdout.trim().split('\n')
                            .filter(p => p.trim())
                            .map(p => ({ port: p.trim(), description: '' }));
                        resolve(ports);
                    }
                });
            }
        });
    }

    /**
     * 获取串口设备描述
     */
    private async getPortDescriptions(ports: {port: string, description: string}[]): Promise<{port: string, description: string}[]> {
        return new Promise((resolve) => {
            const { exec } = require('child_process');
            
            // 使用 WMI 获取设备描述
            const cmd = `powershell -Command "Get-CimInstance -ClassName Win32_PnPEntity | Where-Object { $_.Name -match 'COM\\d+' } | ForEach-Object { $_.Name }"`;
            exec(cmd, { timeout: 5000 }, (error: any, stdout: string) => {
                if (!error && stdout.trim()) {
                    const descriptions = stdout.trim().split('\n').filter(d => d.trim());
                    
                    // 匹配端口和描述
                    for (const port of ports) {
                        for (const desc of descriptions) {
                            const match = desc.match(/\((COM\d+)\)/);
                            if (match && match[1] === port.port) {
                                port.description = desc.trim();
                                break;
                            }
                        }
                    }
                }
                resolve(ports);
            });
        });
    }

    /**
     * 连接串口
     */
    async connect(): Promise<void> {
        // 获取可用串口
        const ports = await this.listPortsQuick();
        
        if (ports.length === 0) {
            vscode.window.showWarningMessage('未检测到串口设备');
            return;
        }

        // 让用户选择串口（显示描述信息）
        const portItems = ports.map(p => ({
            label: p.port,
            description: p.description || '',
            port: p.port
        }));

        const selectedItem = await vscode.window.showQuickPick(portItems, {
            placeHolder: '选择串口',
            title: '串口连接'
        });

        if (!selectedItem) {
            return;
        }

        // 让用户选择波特率
        const baudRates = ['9600', '19200', '38400', '57600', '115200', '230400', '460800', '921600'];
        const config = vscode.workspace.getConfiguration('stm32');
        const defaultBaud = config.get<number>('serial.baudRate', 115200);
        
        const selectedBaud = await vscode.window.showQuickPick(baudRates, {
            placeHolder: `选择波特率 (当前: ${defaultBaud})`,
            title: '波特率设置'
        });

        if (!selectedBaud) {
            return;
        }

        this.currentPort = selectedItem.port;
        this.currentBaudRate = parseInt(selectedBaud);

        // 创建或复用终端
        await this.startMonitor();
    }

    /**
     * 启动串口监视器
     */
    private async startMonitor(): Promise<void> {
        // 如果已有终端，先关闭
        if (this.terminal) {
            this.terminal.dispose();
        }

        // 检测可用的串口监控方式
        const monitorCmd = await this.getMonitorCommand();
        
        if (!monitorCmd) {
            vscode.window.showErrorMessage('未找到可用的串口监控工具。请安装 Python 并运行 pip install pyserial');
            return;
        }

        // 创建新终端
        this.terminal = vscode.window.createTerminal({
            name: `串口: ${this.currentPort}`,
            iconPath: new vscode.ThemeIcon('plug')
        });

        this.terminal.show();
        this.terminal.sendText(monitorCmd);

        this.isConnected = true;
        this.updateStatusBar();

        vscode.window.showInformationMessage(`已连接到 ${this.currentPort} @ ${this.currentBaudRate}`);
    }

    /**
     * 获取串口监控命令
     */
    private async getMonitorCommand(): Promise<string | null> {
        const port = this.currentPort;
        const baud = this.currentBaudRate;

        // 方案1: 使用 Python pyserial (推荐)
        if (await this.checkPythonSerial()) {
            // 创建一个简单的 Python 串口监控脚本
            const pythonScript = `
import serial
import sys

try:
    ser = serial.Serial('${port}', ${baud}, timeout=0.1)
    print(f'已连接到 ${port} @ ${baud}')
    print('按 Ctrl+C 退出')
    print('-' * 40)
    while True:
        data = ser.read(1024)
        if data:
            sys.stdout.write(data.decode('utf-8', errors='replace'))
            sys.stdout.flush()
except KeyboardInterrupt:
    print('\\n已断开连接')
except Exception as e:
    print(f'错误: {e}')
finally:
    try:
        ser.close()
    except:
        pass
`.trim().replace(/\n/g, '; ').replace(/'/g, '"');

            return `python -c "${pythonScript}"`;
        }

        // 方案2: 使用 PowerShell (Windows)
        if (process.platform === 'win32') {
            return this.getPowerShellMonitorCommand();
        }

        // 方案3: 使用 screen 或 minicom (Linux/Mac)
        if (await this.checkCommand('screen')) {
            return `screen ${port} ${baud}`;
        }

        if (await this.checkCommand('minicom')) {
            return `minicom -D ${port} -b ${baud}`;
        }

        return null;
    }

    /**
     * PowerShell 串口监控命令
     */
    private getPowerShellMonitorCommand(): string {
        const port = this.currentPort;
        const baud = this.currentBaudRate;
        
        // PowerShell 串口读取脚本
        return `powershell -Command "$port = New-Object System.IO.Ports.SerialPort('${port}', ${baud}); $port.Open(); Write-Host '已连接到 ${port} @ ${baud}'; Write-Host '按 Ctrl+C 退出'; Write-Host ('-' * 40); try { while ($true) { if ($port.BytesToRead -gt 0) { $data = $port.ReadExisting(); Write-Host -NoNewline $data } Start-Sleep -Milliseconds 10 } } finally { $port.Close() }"`;
    }

    /**
     * 检查 Python serial 是否可用
     */
    private async checkPythonSerial(): Promise<boolean> {
        return new Promise((resolve) => {
            const { exec } = require('child_process');
            exec('python -c "import serial"', { timeout: 3000 }, (error: any) => {
                resolve(!error);
            });
        });
    }

    /**
     * 检查命令是否存在
     */
    private async checkCommand(cmd: string): Promise<boolean> {
        return new Promise((resolve) => {
            const { exec } = require('child_process');
            const checkCmd = process.platform === 'win32' ? `where ${cmd}` : `which ${cmd}`;
            exec(checkCmd, { timeout: 2000 }, (error: any) => {
                resolve(!error);
            });
        });
    }

    /**
     * 断开串口
     */
    async disconnect(): Promise<void> {
        if (this.terminal) {
            // 发送 Ctrl+C 中断
            this.terminal.sendText('\x03');
            setTimeout(() => {
                this.terminal?.dispose();
                this.terminal = undefined;
            }, 500);
        }
        this.isConnected = false;
        this.updateStatusBar();
    }

    /**
     * 切换连接状态
     */
    async toggle(): Promise<void> {
        if (this.isConnected) {
            await this.disconnect();
            vscode.window.showInformationMessage('串口已断开');
        } else {
            await this.connect();
        }
    }

    /**
     * 发送数据
     */
    async send(data?: string): Promise<void> {
        if (!this.isConnected || !this.terminal) {
            vscode.window.showWarningMessage('请先连接串口');
            return;
        }

        const input = data || await vscode.window.showInputBox({
            prompt: '输入要发送的数据',
            placeHolder: '数据内容'
        });

        if (input) {
            // 通过 Python 发送
            if (await this.checkPythonSerial()) {
                const sendCmd = `python -c "import serial; s=serial.Serial('${this.currentPort}', ${this.currentBaudRate}, timeout=1); s.write(b'${input}'); s.close(); print('已发送: ${input}')"`;
                
                // 在新的命令中发送
                const sendTerminal = vscode.window.createTerminal({
                    name: '串口发送',
                    hideFromUser: true
                });
                sendTerminal.sendText(sendCmd);
                setTimeout(() => sendTerminal.dispose(), 2000);
                
                vscode.window.showInformationMessage(`已发送: ${input}`);
            } else {
                vscode.window.showWarningMessage('需要 Python + pyserial 才能发送数据');
            }
        }
    }

    /**
     * 显示终端
     */
    show(): void {
        if (this.terminal) {
            this.terminal.show();
        } else {
            vscode.window.showInformationMessage('串口未连接');
        }
    }

    /**
     * 释放资源
     */
    dispose(): void {
        this.terminal?.dispose();
        this.statusBarItem.dispose();
    }
}

