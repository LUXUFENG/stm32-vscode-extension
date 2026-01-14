import * as vscode from 'vscode';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { CMakeBuilder } from './cmakeBuilder';

export class OpenOCDManager {
    private outputChannel: vscode.OutputChannel;
    private openocdProcess: ChildProcess | null = null;
    private cmakeBuilder: CMakeBuilder;

    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
        this.cmakeBuilder = new CMakeBuilder(outputChannel);
    }

    private getConfig() {
        const config = vscode.workspace.getConfiguration('stm32');
        return {
            openocdPath: config.get<string>('openocdPath') || 'openocd',
            openocdScriptsPath: config.get<string>('openocdScriptsPath') || '',
            debugInterface: config.get<string>('debugInterface') || 'stlink',
            selectedChip: config.get<string>('selectedChip') || '',
            elfFile: config.get<string>('elfFile') || '',
            buildType: config.get<string>('buildType') || 'Debug'
        };
    }

    private getOpenOCDTarget(): string {
        const config = this.getConfig();
        const chipName = config.selectedChip.toLowerCase();

        // 根据芯片型号返回对应的 OpenOCD target 配置
        if (chipName.startsWith('stm32f0')) return 'stm32f0x';
        if (chipName.startsWith('stm32f1')) return 'stm32f1x';
        if (chipName.startsWith('stm32f2')) return 'stm32f2x';
        if (chipName.startsWith('stm32f3')) return 'stm32f3x';
        if (chipName.startsWith('stm32f4')) return 'stm32f4x';
        if (chipName.startsWith('stm32f7')) return 'stm32f7x';
        if (chipName.startsWith('stm32g0')) return 'stm32g0x';
        if (chipName.startsWith('stm32g4')) return 'stm32g4x';
        if (chipName.startsWith('stm32h7')) return 'stm32h7x';
        if (chipName.startsWith('stm32l0')) return 'stm32l0';
        if (chipName.startsWith('stm32l1')) return 'stm32l1';
        if (chipName.startsWith('stm32l4')) return 'stm32l4x';
        if (chipName.startsWith('stm32l5')) return 'stm32l5x';
        if (chipName.startsWith('stm32u5')) return 'stm32u5x';
        if (chipName.startsWith('stm32wb')) return 'stm32wbx';
        if (chipName.startsWith('stm32wl')) return 'stm32wlx';

        return 'stm32f1x'; // 默认
    }

    private getInterfaceConfig(): string {
        const config = this.getConfig();
        switch (config.debugInterface) {
            case 'stlink':
            case 'stlink-v2':
                return 'interface/stlink-v2.cfg';
            case 'stlink-v2-1':
                return 'interface/stlink-v2-1.cfg';
            case 'stlink-v3':
                return 'interface/stlink.cfg';
            case 'jlink':
                return 'interface/jlink.cfg';
            case 'cmsis-dap':
                return 'interface/cmsis-dap.cfg';
            default:
                return 'interface/stlink.cfg';
        }
    }

    /**
     * 给包含空格的路径加上引号
     */
    private quotePath(p: string): string {
        if (p.includes(' ') && !p.startsWith('"') && !p.startsWith("'")) {
            return `"${p}"`;
        }
        return p;
    }

    async start(): Promise<void> {
        if (this.openocdProcess) {
            this.outputChannel.appendLine('OpenOCD 已在运行');
            return;
        }

        const config = this.getConfig();
        const target = this.getOpenOCDTarget();
        const interfaceConfig = this.getInterfaceConfig();

        const args: string[] = [];

        // 添加脚本路径
        if (config.openocdScriptsPath) {
            args.push('-s', config.openocdScriptsPath);
        }

        // 添加接口配置
        args.push('-f', interfaceConfig);

        // 添加目标配置
        args.push('-f', `target/${target}.cfg`);

        const openocdCmd = this.quotePath(config.openocdPath);
        const quotedArgs = args.map(arg => this.quotePath(arg));
        
        this.outputChannel.appendLine(`启动 OpenOCD: ${openocdCmd} ${quotedArgs.join(' ')}`);

        return new Promise((resolve, reject) => {
            this.openocdProcess = spawn(openocdCmd, quotedArgs, {
                shell: true
            });

            let started = false;

            this.openocdProcess.stdout?.on('data', (data) => {
                const output = data.toString();
                this.outputChannel.appendLine(`[OpenOCD] ${output}`);
                
                // 检测 OpenOCD 是否成功启动
                if (output.includes('Listening on port') && !started) {
                    started = true;
                    resolve();
                }
            });

            this.openocdProcess.stderr?.on('data', (data) => {
                const output = data.toString();
                this.outputChannel.appendLine(`[OpenOCD] ${output}`);
                
                if (output.includes('Listening on port') && !started) {
                    started = true;
                    resolve();
                }
            });

            this.openocdProcess.on('close', (code) => {
                this.outputChannel.appendLine(`OpenOCD 进程退出，退出码: ${code}`);
                this.openocdProcess = null;
                if (!started) {
                    reject(new Error(`OpenOCD 启动失败，退出码: ${code}`));
                }
            });

            this.openocdProcess.on('error', (err) => {
                this.outputChannel.appendLine(`OpenOCD 错误: ${err.message}`);
                this.openocdProcess = null;
                reject(err);
            });

            // 设置超时
            setTimeout(() => {
                if (!started && this.openocdProcess) {
                    resolve(); // 假设已启动
                }
            }, 3000);
        });
    }

    stop(): void {
        if (this.openocdProcess) {
            this.openocdProcess.kill();
            this.openocdProcess = null;
            this.outputChannel.appendLine('OpenOCD 已停止');
        }
    }

    isRunning(): boolean {
        return this.openocdProcess !== null;
    }

    async flash(): Promise<void> {
        const config = this.getConfig();
        
        // 查找可烧录的文件 (ELF, BIN, HEX)
        let flashFile: string | undefined = config.elfFile;
        if (!flashFile) {
            flashFile = await this.selectFlashFile();
        }

        if (!flashFile) {
            throw new Error('找不到可烧录的文件，请先编译项目');
        }

        // 如果是相对路径，转换为绝对路径
        if (!path.isAbsolute(flashFile)) {
            const folders = vscode.workspace.workspaceFolders;
            if (folders && folders.length > 0) {
                flashFile = path.join(folders[0].uri.fsPath, flashFile);
            }
        }

        this.outputChannel.appendLine(`下载程序: ${flashFile}`);

        const target = this.getOpenOCDTarget();
        const interfaceConfig = this.getInterfaceConfig();

        const args: string[] = [];

        if (config.openocdScriptsPath) {
            // 将 Windows 反斜杠转换为正斜杠
            args.push('-s', config.openocdScriptsPath.replace(/\\/g, '/'));
        }

        args.push('-f', interfaceConfig);
        args.push('-f', `target/${target}.cfg`);
        
        // 根据文件类型选择不同的烧录命令
        // 将 Windows 反斜杠转换为正斜杠，避免转义问题
        const flashFilePath = flashFile.replace(/\\/g, '/');
        
        const ext = path.extname(flashFile).toLowerCase();
        if (ext === '.bin') {
            // BIN 文件需要指定起始地址 (默认 0x08000000 for STM32)
            const flashAddress = this.getFlashAddress();
            args.push('-c', `program "${flashFilePath}" verify reset exit ${flashAddress}`);
        } else if (ext === '.hex') {
            // HEX 文件包含地址信息
            args.push('-c', `program "${flashFilePath}" verify reset exit`);
        } else {
            // ELF 文件
            args.push('-c', `program "${flashFilePath}" verify reset exit`);
        }

        const openocdCmd = this.quotePath(config.openocdPath);
        const quotedArgs = args.map(arg => this.quotePath(arg));

        return new Promise((resolve, reject) => {
            const flashProcess = spawn(openocdCmd, quotedArgs, {
                shell: true
            });

            flashProcess.stdout?.on('data', (data) => {
                this.outputChannel.appendLine(data.toString());
            });

            flashProcess.stderr?.on('data', (data) => {
                this.outputChannel.appendLine(data.toString());
            });

            flashProcess.on('close', (code) => {
                if (code === 0) {
                    this.outputChannel.appendLine('程序下载成功！');
                    resolve();
                } else {
                    reject(new Error(`程序下载失败，退出码: ${code}`));
                }
            });

            flashProcess.on('error', (err) => {
                reject(err);
            });
        });
    }

    async reset(): Promise<void> {
        const config = this.getConfig();
        const target = this.getOpenOCDTarget();
        const interfaceConfig = this.getInterfaceConfig();

        const args: string[] = [];

        if (config.openocdScriptsPath) {
            args.push('-s', config.openocdScriptsPath);
        }

        args.push('-f', interfaceConfig);
        args.push('-f', `target/${target}.cfg`);
        args.push('-c', 'init');
        args.push('-c', 'reset');
        args.push('-c', 'exit');

        const openocdCmd = this.quotePath(config.openocdPath);
        const quotedArgs = args.map(arg => this.quotePath(arg));

        return new Promise((resolve, reject) => {
            const resetProcess = spawn(openocdCmd, quotedArgs, {
                shell: true
            });

            resetProcess.on('close', (code) => {
                if (code === 0) {
                    this.outputChannel.appendLine('芯片已复位');
                    resolve();
                } else {
                    reject(new Error(`复位失败，退出码: ${code}`));
                }
            });

            resetProcess.on('error', (err) => {
                reject(err);
            });
        });
    }

    getDebugConfigFiles(): string[] {
        const target = this.getOpenOCDTarget();
        const interfaceConfig = this.getInterfaceConfig();
        return [interfaceConfig, `target/${target}.cfg`];
    }

    /**
     * 选择要烧录的文件（根据当前构建类型优先选择）
     */
    private async selectFlashFile(): Promise<string | undefined> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return undefined;
        }

        const config = this.getConfig();
        const buildType = config.buildType;  // Debug 或 Release
        const projectName = path.basename(workspaceFolder.uri.fsPath);
        const workspacePath = workspaceFolder.uri.fsPath;

        // 优先在当前构建类型目录下搜索
        const priorityPatterns = [
            `build/${buildType}/*.elf`,
            `build/${buildType}/*.hex`,
            `build/${buildType}/*.bin`,
        ];
        
        // 备选目录
        const fallbackPatterns = [
            'build/**/*.elf',
            'build/**/*.hex',
            'build/**/*.bin',
        ];

        // 先搜索优先目录
        let priorityFiles: vscode.Uri[] = [];
        for (const pattern of priorityPatterns) {
            const files = await vscode.workspace.findFiles(
                new vscode.RelativePattern(workspaceFolder, pattern),
                null,
                10
            );
            priorityFiles = priorityFiles.concat(files);
        }

        // 如果在当前构建类型目录找到了文件
        if (priorityFiles.length > 0) {
            // 优先选择与项目同名的 ELF 文件
            const projectElf = priorityFiles.find(f => {
                const baseName = path.basename(f.fsPath, '.elf');
                return baseName.toLowerCase() === projectName.toLowerCase() && f.fsPath.endsWith('.elf');
            });
            if (projectElf) {
                return projectElf.fsPath;
            }

            // 只有一个文件，直接返回
            if (priorityFiles.length === 1) {
                return priorityFiles[0].fsPath;
            }

            // 多个文件，让用户选择
            return this.promptSelectFlashFile(priorityFiles, workspacePath, buildType);
        }

        // 备选目录搜索
        let allFiles: vscode.Uri[] = [];
        for (const pattern of fallbackPatterns) {
            const files = await vscode.workspace.findFiles(
                new vscode.RelativePattern(workspaceFolder, pattern),
                null,
                20
            );
            allFiles = allFiles.concat(files);
        }

        if (allFiles.length === 0) {
            // 如果 build 目录没有文件，提示用户先编译
            const choice = await vscode.window.showWarningMessage(
                `在 build/${buildType} 目录中找不到固件文件，是否先编译项目？`,
                '编译项目',
                '手动选择文件'
            );
            
            if (choice === '编译项目') {
                await vscode.commands.executeCommand('stm32.build');
                // 重新搜索
                return this.selectFlashFile();
            } else if (choice === '手动选择文件') {
                const fileUri = await vscode.window.showOpenDialog({
                    canSelectFiles: true,
                    canSelectFolders: false,
                    canSelectMany: false,
                    filters: {
                        '固件文件': ['elf', 'bin', 'hex'],
                        '所有文件': ['*']
                    },
                    title: '选择要烧录的固件文件'
                });
                return fileUri?.[0]?.fsPath;
            }
            return undefined;
        }

        // 优先选择当前构建类型目录中的文件
        const buildTypeFiles = allFiles.filter(f => 
            f.fsPath.toLowerCase().includes(buildType.toLowerCase())
        );

        if (buildTypeFiles.length === 1) {
            return buildTypeFiles[0].fsPath;
        }

        if (buildTypeFiles.length > 1) {
            return this.promptSelectFlashFile(buildTypeFiles, workspacePath, buildType);
        }

        // 只有一个文件
        if (allFiles.length === 1) {
            return allFiles[0].fsPath;
        }

        // 多个文件，让用户选择
        return this.promptSelectFlashFile(allFiles, workspacePath, buildType);
    }

    /**
     * 提示用户选择烧录文件
     */
    private async promptSelectFlashFile(
        files: vscode.Uri[],
        workspacePath: string,
        currentBuildType: string
    ): Promise<string | undefined> {
        const items = files.map(f => {
            const ext = path.extname(f.fsPath).toUpperCase().slice(1);
            const relativePath = path.relative(workspacePath, f.fsPath);
            const isCurrentType = relativePath.toLowerCase().includes(currentBuildType.toLowerCase());
            return {
                label: `${isCurrentType ? '$(check) ' : ''}$(file-binary) ${path.basename(f.fsPath)}`,
                description: `[${ext}] ${relativePath}`,
                detail: isCurrentType ? `当前构建类型: ${currentBuildType}` : undefined,
                path: f.fsPath,
                isCurrentType
            };
        });

        // 排序：当前构建类型优先，然后按文件类型 ELF > HEX > BIN
        items.sort((a, b) => {
            // 先按构建类型
            if (a.isCurrentType !== b.isCurrentType) {
                return b.isCurrentType ? 1 : -1;
            }
            // 再按文件类型
            const order: Record<string, number> = { '.elf': 0, '.hex': 1, '.bin': 2 };
            const extA = path.extname(a.path).toLowerCase();
            const extB = path.extname(b.path).toLowerCase();
            return (order[extA] || 9) - (order[extB] || 9);
        });

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: `选择要烧录的文件 (当前构建类型: ${currentBuildType})`,
            title: '选择固件文件'
        });

        return selected?.path;
    }

    /**
     * 获取 Flash 起始地址
     */
    private getFlashAddress(): string {
        const config = this.getConfig();
        const chipName = config.selectedChip.toLowerCase();

        // STM32 系列的 Flash 起始地址
        // 大部分 STM32 的 Flash 起始地址都是 0x08000000
        // 但某些系列可能不同
        if (chipName.startsWith('stm32h7')) {
            // STM32H7 某些型号可能有不同的地址
            return '0x08000000';
        }
        if (chipName.startsWith('stm32wb')) {
            return '0x08000000';
        }
        if (chipName.startsWith('stm32l0') || chipName.startsWith('stm32l1')) {
            return '0x08000000';
        }
        
        // 默认地址
        return '0x08000000';
    }
}

