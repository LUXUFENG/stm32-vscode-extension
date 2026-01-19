/**
 * OpenOCD 管理器
 * 负责 OpenOCD 服务的启动、停止和程序烧录
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { CMakeBuilder } from './cmakeBuilder';
import { getSTM32Config } from './config';
import { getOpenOCDTarget, getInterfaceConfig, getFlashAddress, quotePath, toForwardSlash } from './chipUtils';

export class OpenOCDManager {
    private outputChannel: vscode.OutputChannel;
    private openocdProcess: ChildProcess | null = null;
    private cmakeBuilder: CMakeBuilder;

    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
        this.cmakeBuilder = new CMakeBuilder(outputChannel);
    }

    /**
     * 启动 OpenOCD 服务
     */
    async start(): Promise<void> {
        if (this.openocdProcess) {
            this.outputChannel.appendLine('OpenOCD 已在运行');
            return;
        }

        const config = getSTM32Config();
        const target = getOpenOCDTarget(config.selectedChip);
        const interfaceConfig = getInterfaceConfig(config.debugInterface);

        const args: string[] = [];

        // 添加脚本路径
        if (config.openocdScriptsPath) {
            args.push('-s', config.openocdScriptsPath);
        }

        // 添加接口配置
        args.push('-f', interfaceConfig);

        // 添加目标配置
        args.push('-f', `target/${target}.cfg`);

        const openocdCmd = quotePath(config.openocdPath);
        const quotedArgs = args.map(arg => quotePath(arg));
        
        this.outputChannel.appendLine(`启动 OpenOCD: ${openocdCmd} ${quotedArgs.join(' ')}`);

        return new Promise((resolve, reject) => {
            this.openocdProcess = spawn(openocdCmd, quotedArgs, {
                shell: true
            });

            let started = false;

            this.openocdProcess.stdout?.on('data', (data) => {
                const output = data.toString();
                this.outputChannel.appendLine(`[OpenOCD] ${output}`);
                
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

    /**
     * 停止 OpenOCD 服务
     */
    stop(): void {
        if (this.openocdProcess) {
            this.openocdProcess.kill();
            this.openocdProcess = null;
            this.outputChannel.appendLine('OpenOCD 已停止');
        }
    }

    /**
     * 检查 OpenOCD 是否正在运行
     */
    isRunning(): boolean {
        return this.openocdProcess !== null;
    }

    /**
     * 烧录程序到芯片
     */
    async flash(): Promise<void> {
        const config = getSTM32Config();
        
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

        const target = getOpenOCDTarget(config.selectedChip);
        const interfaceConfig = getInterfaceConfig(config.debugInterface);

        const args: string[] = [];

        if (config.openocdScriptsPath) {
            args.push('-s', toForwardSlash(config.openocdScriptsPath));
        }

        args.push('-f', interfaceConfig);
        args.push('-f', `target/${target}.cfg`);
        
        // 将路径转换为正斜杠格式
        const flashFilePath = toForwardSlash(flashFile);
        
        const ext = path.extname(flashFile).toLowerCase();
        if (ext === '.bin') {
            // BIN 文件需要指定起始地址
            const flashAddress = getFlashAddress(config.selectedChip);
            args.push('-c', `program "${flashFilePath}" verify reset exit ${flashAddress}`);
        } else {
            // HEX 或 ELF 文件
            args.push('-c', `program "${flashFilePath}" verify reset exit`);
        }

        const openocdCmd = quotePath(config.openocdPath);
        const quotedArgs = args.map(arg => quotePath(arg));

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

    /**
     * 复位芯片
     */
    async reset(): Promise<void> {
        const config = getSTM32Config();
        const target = getOpenOCDTarget(config.selectedChip);
        const interfaceConfig = getInterfaceConfig(config.debugInterface);

        const args: string[] = [];

        if (config.openocdScriptsPath) {
            args.push('-s', config.openocdScriptsPath);
        }

        args.push('-f', interfaceConfig);
        args.push('-f', `target/${target}.cfg`);
        args.push('-c', 'init');
        args.push('-c', 'reset');
        args.push('-c', 'exit');

        const openocdCmd = quotePath(config.openocdPath);
        const quotedArgs = args.map(arg => quotePath(arg));

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

    /**
     * 获取调试配置文件列表
     */
    getDebugConfigFiles(): string[] {
        const config = getSTM32Config();
        const target = getOpenOCDTarget(config.selectedChip);
        const interfaceConfig = getInterfaceConfig(config.debugInterface);
        return [interfaceConfig, `target/${target}.cfg`];
    }

    /**
     * 选择要烧录的文件
     */
    private async selectFlashFile(): Promise<string | undefined> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return undefined;
        }

        const config = getSTM32Config();
        const buildType = config.buildType;
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

        if (priorityFiles.length > 0) {
            // 优先选择与项目同名的 ELF 文件
            const projectElf = priorityFiles.find(f => {
                const baseName = path.basename(f.fsPath, '.elf');
                return baseName.toLowerCase() === projectName.toLowerCase() && f.fsPath.endsWith('.elf');
            });
            if (projectElf) {
                return projectElf.fsPath;
            }

            if (priorityFiles.length === 1) {
                return priorityFiles[0].fsPath;
            }

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
            const choice = await vscode.window.showWarningMessage(
                `在 build/${buildType} 目录中找不到固件文件，是否先编译项目？`,
                '编译项目',
                '手动选择文件'
            );
            
            if (choice === '编译项目') {
                await vscode.commands.executeCommand('stm32.build');
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

        if (allFiles.length === 1) {
            return allFiles[0].fsPath;
        }

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

        // 排序：当前构建类型优先
        items.sort((a, b) => {
            if (a.isCurrentType !== b.isCurrentType) {
                return b.isCurrentType ? 1 : -1;
            }
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
}
