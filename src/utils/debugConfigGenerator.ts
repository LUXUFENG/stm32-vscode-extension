import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class DebugConfigGenerator {
    
    /**
     * 在构建目录中查找 ELF 文件（根据当前构建类型优先选择）
     */
    private async findElfFile(): Promise<string | undefined> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return undefined;
        }

        const config = this.getConfig();
        const workspacePath = workspaceFolder.uri.fsPath;
        const buildType = config.buildType;  // Debug 或 Release
        
        // 按优先级排序的构建目录（当前构建类型的目录优先）
        const priorityDirs = [
            path.join(workspacePath, 'build', buildType),  // build/Debug 或 build/Release (preset 风格)
            path.join(workspacePath, config.buildDirectory, buildType),  // 自定义目录/Debug
        ];
        
        // 其他可能的目录（低优先级）
        const fallbackDirs = [
            path.join(workspacePath, config.buildDirectory),
            path.join(workspacePath, 'build'),
        ];

        // 先在优先目录中查找
        for (const buildDir of priorityDirs) {
            try {
                const files = await vscode.workspace.findFiles(
                    new vscode.RelativePattern(buildDir, '*.elf'),  // 只搜索顶层
                    null,
                    5
                );
                if (files.length === 1) {
                    return files[0].fsPath;
                }
                if (files.length > 1) {
                    // 多个文件，让用户选择
                    return this.promptSelectElfFile(files, workspacePath, buildType);
                }
            } catch {
                // 目录不存在，继续
            }
        }

        // 如果优先目录没找到，搜索备选目录
        let allFiles: vscode.Uri[] = [];
        for (const buildDir of fallbackDirs) {
            try {
                const files = await vscode.workspace.findFiles(
                    new vscode.RelativePattern(buildDir, '**/*.elf'),
                    null,
                    10
                );
                allFiles = allFiles.concat(files);
            } catch {
                // 目录不存在，继续
            }
        }

        // 去重
        const uniqueFiles = [...new Set(allFiles.map(f => f.fsPath))];
        
        if (uniqueFiles.length === 0) {
            return undefined;
        }

        if (uniqueFiles.length === 1) {
            return uniqueFiles[0];
        }

        // 多个文件，优先选择当前构建类型的
        const buildTypeFile = uniqueFiles.find(f => 
            f.toLowerCase().includes(buildType.toLowerCase())
        );
        if (buildTypeFile) {
            return buildTypeFile;
        }

        // 还是多个，让用户选择
        return this.promptSelectElfFile(
            uniqueFiles.map(f => vscode.Uri.file(f)), 
            workspacePath, 
            buildType
        );
    }

    /**
     * 提示用户选择 ELF 文件
     */
    private async promptSelectElfFile(
        files: vscode.Uri[], 
        workspacePath: string,
        currentBuildType: string
    ): Promise<string | undefined> {
        const items = files.map(f => {
            const relativePath = path.relative(workspacePath, f.fsPath);
            const isCurrentType = relativePath.toLowerCase().includes(currentBuildType.toLowerCase());
            return {
                label: `${isCurrentType ? '$(check) ' : ''}${path.basename(f.fsPath)}`,
                description: relativePath,
                detail: isCurrentType ? `当前构建类型: ${currentBuildType}` : undefined,
                path: f.fsPath,
                isCurrentType
            };
        });

        // 当前构建类型的排在前面
        items.sort((a, b) => (b.isCurrentType ? 1 : 0) - (a.isCurrentType ? 1 : 0));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: `选择要调试的 ELF 文件 (当前构建类型: ${currentBuildType})`
        });

        return selected?.path;
    }

    private getConfig() {
        const stm32Config = vscode.workspace.getConfiguration('stm32');
        return {
            selectedChip: stm32Config.get<string>('selectedChip') || 'STM32F103C8',
            debugInterface: stm32Config.get<string>('debugInterface') || 'stlink',
            buildDirectory: stm32Config.get<string>('buildDirectory') || 'build',
            buildType: stm32Config.get<string>('buildType') || 'Debug',
            toolchainPath: stm32Config.get<string>('toolchainPath') || '',
            openocdPath: stm32Config.get<string>('openocdPath') || 'openocd',
            svdFile: stm32Config.get<string>('svdFile') || ''
        };
    }

    private getOpenOCDTarget(chipName: string): string {
        const chip = chipName.toLowerCase();
        if (chip.startsWith('stm32f0')) return 'stm32f0x';
        if (chip.startsWith('stm32f1')) return 'stm32f1x';
        if (chip.startsWith('stm32f2')) return 'stm32f2x';
        if (chip.startsWith('stm32f3')) return 'stm32f3x';
        if (chip.startsWith('stm32f4')) return 'stm32f4x';
        if (chip.startsWith('stm32f7')) return 'stm32f7x';
        if (chip.startsWith('stm32g0')) return 'stm32g0x';
        if (chip.startsWith('stm32g4')) return 'stm32g4x';
        if (chip.startsWith('stm32h7')) return 'stm32h7x';
        if (chip.startsWith('stm32l0')) return 'stm32l0';
        if (chip.startsWith('stm32l1')) return 'stm32l1';
        if (chip.startsWith('stm32l4')) return 'stm32l4x';
        if (chip.startsWith('stm32l5')) return 'stm32l5x';
        if (chip.startsWith('stm32u5')) return 'stm32u5x';
        if (chip.startsWith('stm32wb')) return 'stm32wbx';
        return 'stm32f1x';
    }

    private getInterfaceConfig(debugInterface: string): string {
        switch (debugInterface) {
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

    async getOrCreateDebugConfig(): Promise<vscode.DebugConfiguration | undefined> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('请先打开工作区');
            return undefined;
        }

        // 查找实际的 ELF 文件
        const elfFile = await this.findElfFile();
        if (!elfFile) {
            const choice = await vscode.window.showErrorMessage(
                '找不到 ELF 文件，请先编译项目',
                '编译项目'
            );
            if (choice === '编译项目') {
                await vscode.commands.executeCommand('stm32.build');
                // 编译后重试
                return this.getOrCreateDebugConfig();
            }
            return undefined;
        }

        // 创建调试配置（使用异步版本以支持 SVD 文件查找）
        const config = this.getConfig();
        return this.createDebugConfigAsync(config, elfFile);
    }

    private async createDebugConfigAsync(settings: ReturnType<typeof this.getConfig>, elfFile: string): Promise<vscode.DebugConfiguration> {
        const target = this.getOpenOCDTarget(settings.selectedChip);
        const interfaceConfig = this.getInterfaceConfig(settings.debugInterface);

        // Windows 需要 .exe 扩展名
        const ext = process.platform === 'win32' ? '.exe' : '';
        const gdbPath = settings.toolchainPath 
            ? path.join(settings.toolchainPath, `arm-none-eabi-gdb${ext}`)
            : `arm-none-eabi-gdb${ext}`;

        // 获取 OpenOCD scripts 目录
        const openocdScriptsPath = this.getOpenOCDScriptsPath(settings.openocdPath);

        // 尝试自动查找 SVD 文件
        const svdFile = settings.svdFile || await this.findSvdFile(settings.selectedChip);

        // 将 ELF 路径转换为正斜杠（OpenOCD 需要）
        const elfPathForOpenOCD = elfFile.replace(/\\/g, '/');

        const debugConfig: vscode.DebugConfiguration = {
            type: 'cortex-debug',
            request: 'launch',
            name: `STM32 Debug (${settings.selectedChip || 'OpenOCD'})`,
            servertype: 'openocd',
            cwd: '${workspaceFolder}',
            executable: elfFile,
            device: settings.selectedChip || undefined,
            configFiles: [
                interfaceConfig,
                `target/${target}.cfg`
            ],
            gdbPath: gdbPath,
            runToEntryPoint: 'main',
            showDevDebugOutput: 'parsed',
            armToolchainPath: settings.toolchainPath || undefined,
            
            // Live Watch 配置 - 实时监视变量
            liveWatch: {
                enabled: true,
                samplesPerSecond: 4
            },

            // 使用 OpenOCD 命令烧录，而不是 GDB load（更稳定）
            overrideLaunchCommands: [
                'monitor reset init',
                `monitor flash write_image erase "${elfPathForOpenOCD}"`,
                'monitor reset halt',
                'monitor arm semihosting enable'
            ],

            // 重启命令
            overrideRestartCommands: [
                'monitor reset halt'
            ],
        };

        // 添加 OpenOCD 路径
        if (settings.openocdPath) {
            debugConfig.serverpath = settings.openocdPath;
        }

        // 添加 OpenOCD scripts 搜索路径（关键！）
        if (openocdScriptsPath) {
            debugConfig.searchDir = [openocdScriptsPath];
        } else {
            // 如果没检测到，尝试从 openocd 路径推断
            const openocdDir = path.dirname(settings.openocdPath || '');
            if (openocdDir) {
                // xpack 格式: bin/../share/openocd/scripts
                const xpackScripts = path.resolve(openocdDir, '..', 'share', 'openocd', 'scripts');
                debugConfig.searchDir = [xpackScripts];
            }
        }

        // 添加 SVD 文件（用于查看外设寄存器）
        if (svdFile) {
            debugConfig.svdFile = svdFile;
        }

        return debugConfig;
    }

    // 同步版本，用于兼容
    private createDebugConfig(settings: ReturnType<typeof this.getConfig>, elfFile: string): vscode.DebugConfiguration {
        const target = this.getOpenOCDTarget(settings.selectedChip);
        const interfaceConfig = this.getInterfaceConfig(settings.debugInterface);

        const ext = process.platform === 'win32' ? '.exe' : '';
        const gdbPath = settings.toolchainPath 
            ? path.join(settings.toolchainPath, `arm-none-eabi-gdb${ext}`)
            : `arm-none-eabi-gdb${ext}`;

        const openocdScriptsPath = this.getOpenOCDScriptsPath(settings.openocdPath);
        const elfPathForOpenOCD = elfFile.replace(/\\/g, '/');

        const debugConfig: vscode.DebugConfiguration = {
            type: 'cortex-debug',
            request: 'launch',
            name: `STM32 Debug (${settings.selectedChip || 'OpenOCD'})`,
            servertype: 'openocd',
            cwd: '${workspaceFolder}',
            executable: elfFile,
            device: settings.selectedChip || undefined,
            configFiles: [
                interfaceConfig,
                `target/${target}.cfg`
            ],
            gdbPath: gdbPath,
            runToEntryPoint: 'main',
            showDevDebugOutput: 'parsed',
            armToolchainPath: settings.toolchainPath || undefined,
            liveWatch: {
                enabled: true,
                samplesPerSecond: 4
            },
            // 使用 OpenOCD 命令烧录
            overrideLaunchCommands: [
                'monitor reset init',
                `monitor flash write_image erase "${elfPathForOpenOCD}"`,
                'monitor reset halt',
                'monitor arm semihosting enable'
            ],
            overrideRestartCommands: [
                'monitor reset halt'
            ],
        };

        if (settings.openocdPath) {
            debugConfig.serverpath = settings.openocdPath;
        }

        if (openocdScriptsPath) {
            debugConfig.searchDir = [openocdScriptsPath];
        } else {
            const openocdDir = path.dirname(settings.openocdPath || '');
            if (openocdDir) {
                const xpackScripts = path.resolve(openocdDir, '..', 'share', 'openocd', 'scripts');
                debugConfig.searchDir = [xpackScripts];
            }
        }

        if (settings.svdFile) {
            debugConfig.svdFile = settings.svdFile;
        }

        return debugConfig;
    }

    /**
     * 自动查找 SVD 文件
     */
    private async findSvdFile(chipName: string): Promise<string | undefined> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return undefined;
        }

        // 1. 先在项目目录中查找 .svd 文件
        try {
            const svdFiles = await vscode.workspace.findFiles(
                new vscode.RelativePattern(workspaceFolder, '**/*.svd'),
                '**/node_modules/**',
                5
            );

            if (svdFiles.length === 1) {
                return svdFiles[0].fsPath;
            }

            if (svdFiles.length > 1) {
                // 尝试匹配芯片名称
                const chipLower = chipName.toLowerCase();
                const matchedSvd = svdFiles.find(f => {
                    const fileName = path.basename(f.fsPath).toLowerCase();
                    return fileName.includes(chipLower) || 
                           chipLower.includes(fileName.replace('.svd', ''));
                });
                if (matchedSvd) {
                    return matchedSvd.fsPath;
                }
                // 返回第一个
                return svdFiles[0].fsPath;
            }
        } catch {
            // 忽略错误
        }

        return undefined;
    }

    /**
     * 获取 OpenOCD scripts 目录路径
     */
    private getOpenOCDScriptsPath(openocdPath: string): string | undefined {
        if (!openocdPath) {
            return undefined;
        }

        // 先检查用户是否配置了 openocdScriptsPath
        const stm32Config = vscode.workspace.getConfiguration('stm32');
        const configuredScriptsPath = stm32Config.get<string>('openocdScriptsPath');
        if (configuredScriptsPath && fs.existsSync(configuredScriptsPath)) {
            return configuredScriptsPath;
        }

        // OpenOCD scripts 目录通常在 openocd 可执行文件的相对目录
        const openocdDir = path.dirname(openocdPath);
        const possiblePaths = [
            path.join(openocdDir, '..', 'share', 'openocd', 'scripts'),  // xpack/标准安装
            path.join(openocdDir, '..', 'scripts'),  // 某些安装
            path.join(openocdDir, 'scripts'),  // 便携版
            path.join(openocdDir, '..', '..', 'share', 'openocd', 'scripts'),  // 其他结构
        ];

        for (const scriptsPath of possiblePaths) {
            try {
                const normalizedPath = path.resolve(scriptsPath);
                if (fs.existsSync(normalizedPath)) {
                    // 验证目录中有 interface 和 target 子目录
                    const interfaceDir = path.join(normalizedPath, 'interface');
                    const targetDir = path.join(normalizedPath, 'target');
                    if (fs.existsSync(interfaceDir) && fs.existsSync(targetDir)) {
                        return normalizedPath;
                    }
                }
            } catch {
                // 忽略错误
            }
        }

        return undefined;
    }

    /**
     * 生成/更新 launch.json 并返回配置名称
     */
    async generateLaunchJson(openFile: boolean = true): Promise<string | undefined> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('请先打开工作区');
        }

        // 查找实际的 ELF 文件
        const elfFile = await this.findElfFile();
        if (!elfFile) {
            throw new Error('找不到 ELF 文件，请先编译项目');
        }

        const config = this.getConfig();
        const debugConfig = await this.createDebugConfigAsync(config, elfFile);

        const vscodeDir = path.join(workspaceFolder.uri.fsPath, '.vscode');
        const launchJsonPath = path.join(vscodeDir, 'launch.json');

        // 确保 .vscode 目录存在
        if (!fs.existsSync(vscodeDir)) {
            fs.mkdirSync(vscodeDir, { recursive: true });
        }

        let launchJson: { version: string; configurations: vscode.DebugConfiguration[] };

        if (fs.existsSync(launchJsonPath)) {
            // 读取现有配置
            const content = fs.readFileSync(launchJsonPath, 'utf8');
            try {
                launchJson = JSON.parse(content);
            } catch {
                launchJson = { version: '0.2.0', configurations: [] };
            }

            // 检查是否已存在 STM32 调试配置（按类型和 servertype 匹配）
            const existingIndex = launchJson.configurations.findIndex(c => 
                c.type === 'cortex-debug' && c.servertype === 'openocd'
            );
            if (existingIndex >= 0) {
                launchJson.configurations[existingIndex] = debugConfig;
            } else {
                launchJson.configurations.push(debugConfig);
            }
        } else {
            launchJson = {
                version: '0.2.0',
                configurations: [debugConfig]
            };
        }

        fs.writeFileSync(launchJsonPath, JSON.stringify(launchJson, null, 4), 'utf8');

        if (openFile) {
            // 打开 launch.json 文件
            const doc = await vscode.workspace.openTextDocument(launchJsonPath);
            await vscode.window.showTextDocument(doc);
        }

        return debugConfig.name;
    }

    /**
     * 生成调试配置并启动调试
     */
    async generateAndStartDebug(): Promise<void> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('请先打开工作区');
            return;
        }

        // 生成/更新 launch.json（不打开文件）
        const configName = await this.generateLaunchJson(false);
        if (!configName) {
            return;
        }

        // 启动调试
        await vscode.debug.startDebugging(workspaceFolder, configName);
    }

    private async generateTasksJson(workspacePath: string): Promise<void> {
        const vscodeDir = path.join(workspacePath, '.vscode');
        const tasksJsonPath = path.join(vscodeDir, 'tasks.json');

        const buildTask = {
            label: 'STM32: Build',
            type: 'shell',
            command: 'cmake',
            args: ['--build', 'build', '-j'],
            group: {
                kind: 'build',
                isDefault: true
            },
            problemMatcher: ['$gcc'],
            presentation: {
                reveal: 'always',
                panel: 'shared'
            }
        };

        const cleanTask = {
            label: 'STM32: Clean',
            type: 'shell',
            command: 'cmake',
            args: ['--build', 'build', '--target', 'clean'],
            problemMatcher: [] as string[]
        };

        const configureTask = {
            label: 'STM32: Configure',
            type: 'shell',
            command: 'cmake',
            args: ['-S', '.', '-B', 'build', '-G', 'Ninja'],
            problemMatcher: [] as string[]
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let tasksJson: { version: string; tasks: any[] };

        if (fs.existsSync(tasksJsonPath)) {
            const content = fs.readFileSync(tasksJsonPath, 'utf8');
            try {
                tasksJson = JSON.parse(content);
            } catch {
                tasksJson = { version: '2.0.0', tasks: [] };
            }

            // 添加或更新任务
            const tasksToAdd = [buildTask, cleanTask, configureTask];
            for (const task of tasksToAdd) {
                const existingIndex = tasksJson.tasks.findIndex(t => t.label === task.label);
                if (existingIndex >= 0) {
                    tasksJson.tasks[existingIndex] = task;
                } else {
                    tasksJson.tasks.push(task);
                }
            }
        } else {
            tasksJson = {
                version: '2.0.0',
                tasks: [buildTask, cleanTask, configureTask]
            };
        }

        fs.writeFileSync(tasksJsonPath, JSON.stringify(tasksJson, null, 4), 'utf8');
    }
}
