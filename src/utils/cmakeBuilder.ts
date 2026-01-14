import * as vscode from 'vscode';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';

export class CMakeBuilder {
    private outputChannel: vscode.OutputChannel;
    private buildProcess: ChildProcess | null = null;

    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
    }

    /**
     * 检查 CMake Tools 扩展是否已安装
     */
    private isCMakeToolsInstalled(): boolean {
        const cmakeToolsExt = vscode.extensions.getExtension('ms-vscode.cmake-tools');
        return cmakeToolsExt !== undefined;
    }

    /**
     * 使用 CMake Tools 扩展进行构建
     */
    private async buildWithCMakeTools(): Promise<void> {
        this.outputChannel.appendLine('使用 CMake Tools 扩展编译...');
        try {
            await vscode.commands.executeCommand('cmake.build');
            this.outputChannel.appendLine('CMake Tools 编译完成');
        } catch (error) {
            throw new Error(`CMake Tools 编译失败: ${error}`);
        }
    }

    /**
     * 使用 CMake Tools 扩展进行配置
     */
    private async configureWithCMakeTools(): Promise<void> {
        this.outputChannel.appendLine('使用 CMake Tools 扩展配置...');
        try {
            await vscode.commands.executeCommand('cmake.configure');
            this.outputChannel.appendLine('CMake Tools 配置完成');
        } catch (error) {
            throw new Error(`CMake Tools 配置失败: ${error}`);
        }
    }

    /**
     * 使用 CMake Tools 扩展进行清理
     */
    private async cleanWithCMakeTools(): Promise<void> {
        this.outputChannel.appendLine('使用 CMake Tools 扩展清理...');
        try {
            await vscode.commands.executeCommand('cmake.clean');
            this.outputChannel.appendLine('CMake Tools 清理完成');
        } catch (error) {
            throw new Error(`CMake Tools 清理失败: ${error}`);
        }
    }

    private getConfig() {
        const config = vscode.workspace.getConfiguration('stm32');
        return {
            cmakePath: config.get<string>('cmakePath') || 'cmake',
            toolchainPath: config.get<string>('toolchainPath') || '',
            buildType: config.get<string>('buildType') || 'Debug',
            buildDirectory: config.get<string>('buildDirectory') || 'build'
        };
    }

    private getWorkspaceFolder(): string {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            throw new Error('没有打开工作区文件夹');
        }
        return folders[0].uri.fsPath;
    }

    async configure(): Promise<void> {
        // 优先使用 CMake Tools 扩展
        if (this.isCMakeToolsInstalled()) {
            return this.configureWithCMakeTools();
        }

        const config = this.getConfig();
        const workspaceFolder = this.getWorkspaceFolder();
        const buildDir = path.join(workspaceFolder, config.buildDirectory);

        this.outputChannel.appendLine(`配置 CMake 项目...`);
        this.outputChannel.appendLine(`构建目录: ${buildDir}`);
        this.outputChannel.appendLine(`构建类型: ${config.buildType}`);

        // 检查项目是否有 CMakePresets.json 或 CMakeUserPresets.json
        const hasPresets = await this.hasProjectPresets(workspaceFolder);
        
        if (hasPresets) {
            this.outputChannel.appendLine(`检测到 CMakePresets.json，使用项目配置...`);
            const args = [
                '--preset', config.buildType.toLowerCase(),
            ];
            return this.runCMake(args, workspaceFolder);
        }

        // 没有 presets，使用我们的配置
        const args = [
            '-S', workspaceFolder,
            '-B', buildDir,
            `-DCMAKE_BUILD_TYPE=${config.buildType}`,
            '-G', 'Ninja'
        ];

        // 如果指定了工具链路径，添加交叉编译参数
        if (config.toolchainPath) {
            const ext = process.platform === 'win32' ? '.exe' : '';
            const gccPath = path.join(config.toolchainPath, `arm-none-eabi-gcc${ext}`);
            const gxxPath = path.join(config.toolchainPath, `arm-none-eabi-g++${ext}`);
            const objcopyPath = path.join(config.toolchainPath, `arm-none-eabi-objcopy${ext}`);
            
            args.push('-DCMAKE_SYSTEM_NAME=Generic');
            args.push('-DCMAKE_SYSTEM_PROCESSOR=arm');
            args.push('-DCMAKE_TRY_COMPILE_TARGET_TYPE=STATIC_LIBRARY');
            args.push(`-DCMAKE_C_COMPILER="${gccPath}"`);
            args.push(`-DCMAKE_CXX_COMPILER="${gxxPath}"`);
            args.push(`-DCMAKE_OBJCOPY="${objcopyPath}"`);
        }

        return this.runCMake(args, workspaceFolder);
    }

    private async hasProjectPresets(workspaceFolder: string): Promise<boolean> {
        const presetsFile = path.join(workspaceFolder, 'CMakePresets.json');
        const userPresetsFile = path.join(workspaceFolder, 'CMakeUserPresets.json');
        
        try {
            await vscode.workspace.fs.stat(vscode.Uri.file(presetsFile));
            return true;
        } catch {
            try {
                await vscode.workspace.fs.stat(vscode.Uri.file(userPresetsFile));
                return true;
            } catch {
                return false;
            }
        }
    }

    async build(): Promise<void> {
        // 优先使用 CMake Tools 扩展
        if (this.isCMakeToolsInstalled()) {
            return this.buildWithCMakeTools();
        }

        const config = this.getConfig();
        const workspaceFolder = this.getWorkspaceFolder();
        const buildDir = path.join(workspaceFolder, config.buildDirectory);
        const hasPresets = await this.hasProjectPresets(workspaceFolder);

        // 检查是否需要配置
        const cmakeCacheFile = path.join(buildDir, 'CMakeCache.txt');
        const presetBuildDir = path.join(workspaceFolder, 'build', config.buildType);
        const presetCacheFile = path.join(presetBuildDir, 'CMakeCache.txt');
        
        let needsConfigure = true;
        try {
            if (hasPresets) {
                await vscode.workspace.fs.stat(vscode.Uri.file(presetCacheFile));
            } else {
                await vscode.workspace.fs.stat(vscode.Uri.file(cmakeCacheFile));
            }
            needsConfigure = false;
        } catch {
            // 缓存不存在
        }

        if (needsConfigure) {
            this.outputChannel.appendLine('CMake 缓存不存在，先进行配置...');
            await this.configure();
        }

        this.outputChannel.appendLine(`开始编译...`);

        let args: string[];
        if (hasPresets) {
            args = [
                '--build',
                '--preset', config.buildType.toLowerCase(),
                '-j'
            ];
        } else {
            args = [
                '--build', buildDir,
                '--config', config.buildType,
                '-j'
            ];
        }

        return this.runCMake(args, workspaceFolder);
    }

    async clean(): Promise<void> {
        // 优先使用 CMake Tools 扩展
        if (this.isCMakeToolsInstalled()) {
            return this.cleanWithCMakeTools();
        }

        const config = this.getConfig();
        const workspaceFolder = this.getWorkspaceFolder();
        const buildDir = path.join(workspaceFolder, config.buildDirectory);

        this.outputChannel.appendLine(`清理构建目录...`);

        const args = [
            '--build', buildDir,
            '--target', 'clean'
        ];

        try {
            await this.runCMake(args, workspaceFolder);
        } catch {
            this.outputChannel.appendLine('删除构建目录...');
            try {
                await vscode.workspace.fs.delete(vscode.Uri.file(buildDir), { recursive: true });
                this.outputChannel.appendLine('构建目录已删除');
            } catch (e) {
                this.outputChannel.appendLine(`删除失败: ${e}`);
            }
        }
    }

    async rebuild(): Promise<void> {
        await this.clean();
        await this.configure();
        await this.build();
    }

    private runCMake(args: string[], cwd: string): Promise<void> {
        const config = this.getConfig();
        
        return new Promise((resolve, reject) => {
            // 对路径加引号以处理空格
            const cmakePath = this.quotePath(config.cmakePath);
            const quotedArgs = args.map(arg => this.quotePath(arg));
            
            this.outputChannel.appendLine(`执行: ${cmakePath} ${quotedArgs.join(' ')}`);

            this.buildProcess = spawn(cmakePath, quotedArgs, {
                cwd: cwd,
                shell: true,
                env: {
                    ...process.env,
                    PATH: this.buildToolchainPath()
                }
            });

            this.buildProcess.stdout?.on('data', (data) => {
                const lines = data.toString().split('\n');
                lines.forEach((line: string) => {
                    if (line.trim()) {
                        this.outputChannel.appendLine(line);
                    }
                });
            });

            this.buildProcess.stderr?.on('data', (data) => {
                const lines = data.toString().split('\n');
                lines.forEach((line: string) => {
                    if (line.trim()) {
                        this.outputChannel.appendLine(`[ERROR] ${line}`);
                    }
                });
            });

            this.buildProcess.on('close', (code) => {
                this.buildProcess = null;
                if (code === 0) {
                    this.outputChannel.appendLine('命令执行成功');
                    resolve();
                } else {
                    const error = `命令执行失败，退出码: ${code}`;
                    this.outputChannel.appendLine(error);
                    reject(new Error(error));
                }
            });

            this.buildProcess.on('error', (err) => {
                this.buildProcess = null;
                this.outputChannel.appendLine(`执行错误: ${err.message}`);
                reject(err);
            });
        });
    }

    private buildToolchainPath(): string {
        const config = this.getConfig();
        let pathEnv = process.env.PATH || '';
        
        if (config.toolchainPath) {
            pathEnv = `${config.toolchainPath}${path.delimiter}${pathEnv}`;
        }
        
        return pathEnv;
    }

    /**
     * 给包含空格的路径加上引号
     */
    private quotePath(p: string): string {
        // 如果已经包含引号（如 -DCMAKE_C_COMPILER="path"），不再处理
        if (p.includes('"')) {
            return p;
        }
        // 如果路径包含空格且没有被引号包围，添加引号
        if (p.includes(' ') && !p.startsWith('"') && !p.startsWith("'")) {
            return `"${p}"`;
        }
        return p;
    }

    cancelBuild(): void {
        if (this.buildProcess) {
            this.buildProcess.kill();
            this.buildProcess = null;
            this.outputChannel.appendLine('编译已取消');
        }
    }

    /**
     * 将 ELF 文件转换为 BIN 和 HEX 格式
     */
    async generateBinHex(): Promise<{ bin?: string; hex?: string }> {
        const config = this.getConfig();
        const elfFile = await this.getElfFile();
        
        if (!elfFile) {
            throw new Error('找不到 ELF 文件，请先编译项目');
        }

        this.outputChannel.appendLine(`生成 BIN/HEX 文件...`);
        this.outputChannel.appendLine(`源文件: ${elfFile}`);

        const ext = process.platform === 'win32' ? '.exe' : '';
        let objcopyPath = 'arm-none-eabi-objcopy';
        
        if (config.toolchainPath) {
            objcopyPath = path.join(config.toolchainPath, `arm-none-eabi-objcopy${ext}`);
        }

        const baseName = elfFile.replace(/\.elf$/i, '');
        const binFile = `${baseName}.bin`;
        const hexFile = `${baseName}.hex`;

        // 生成 BIN 文件
        await this.runObjcopy(objcopyPath, ['-O', 'binary', elfFile, binFile]);
        this.outputChannel.appendLine(`✓ 已生成: ${binFile}`);

        // 生成 HEX 文件
        await this.runObjcopy(objcopyPath, ['-O', 'ihex', elfFile, hexFile]);
        this.outputChannel.appendLine(`✓ 已生成: ${hexFile}`);

        return { bin: binFile, hex: hexFile };
    }

    private runObjcopy(objcopyPath: string, args: string[]): Promise<void> {
        return new Promise((resolve, reject) => {
            const quotedPath = this.quotePath(objcopyPath);
            const quotedArgs = args.map(arg => this.quotePath(arg));
            
            const objcopyProcess = spawn(quotedPath, quotedArgs, {
                shell: true,
                env: {
                    ...process.env,
                    PATH: this.buildToolchainPath()
                }
            });

            objcopyProcess.stderr?.on('data', (data: Buffer) => {
                this.outputChannel.appendLine(`[objcopy] ${data.toString()}`);
            });

            objcopyProcess.on('close', (code: number) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`objcopy 失败，退出码: ${code}`));
                }
            });

            objcopyProcess.on('error', (err: Error) => {
                reject(err);
            });
        });
    }

    async getElfFile(): Promise<string | undefined> {
        const config = this.getConfig();
        const workspaceFolder = this.getWorkspaceFolder();
        
        // 尝试多个可能的构建目录
        const possibleBuildDirs = [
            path.join(workspaceFolder, config.buildDirectory),
            path.join(workspaceFolder, 'build', config.buildType),  // preset 风格
            path.join(workspaceFolder, 'build'),
        ];

        // 查找 .elf 文件
        try {
            let allFiles: vscode.Uri[] = [];
            for (const buildDir of possibleBuildDirs) {
                const files = await vscode.workspace.findFiles(
                    new vscode.RelativePattern(buildDir, '**/*.elf'),
                    null,
                    10
                );
                allFiles = allFiles.concat(files);
            }
            const files = allFiles;

            if (files.length === 0) {
                return undefined;
            }

            if (files.length === 1) {
                return files[0].fsPath;
            }

            // 多个 elf 文件，让用户选择
            const items = files.map(f => ({
                label: path.basename(f.fsPath),
                description: f.fsPath,
                path: f.fsPath
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: '选择 ELF 文件'
            });

            return selected?.path;
        } catch {
            return undefined;
        }
    }
}

