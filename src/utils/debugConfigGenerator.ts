/**
 * 调试配置生成器
 * 负责生成 launch.json 配置文件
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getSTM32Config, getWorkspaceFolderSafe } from './config';
import { getOpenOCDTarget, getInterfaceConfig, toForwardSlash } from './chipUtils';

export class DebugConfigGenerator {
    
    /**
     * 获取或创建调试配置
     */
    async getOrCreateDebugConfig(): Promise<vscode.DebugConfiguration | undefined> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('请先打开工作区');
            return undefined;
        }

        const elfFile = await this.findElfFile();
        if (!elfFile) {
            const choice = await vscode.window.showErrorMessage(
                '找不到 ELF 文件，请先编译项目',
                '编译项目'
            );
            if (choice === '编译项目') {
                await vscode.commands.executeCommand('stm32.build');
                return this.getOrCreateDebugConfig();
            }
            return undefined;
        }

        return this.createDebugConfig(elfFile);
    }

    /**
     * 生成或更新 launch.json
     * 智能合并：保留用户的其他配置，只更新 STM32 相关配置
     */
    async generateLaunchJson(openFile: boolean = true): Promise<string | undefined> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('请先打开工作区');
        }

        const elfFile = await this.findElfFile();
        if (!elfFile) {
            throw new Error('找不到 ELF 文件，请先编译项目');
        }

        const debugConfig = await this.createDebugConfig(elfFile);
        const vscodeDir = path.join(workspaceFolder.uri.fsPath, '.vscode');
        const launchJsonPath = path.join(vscodeDir, 'launch.json');

        // 确保 .vscode 目录存在
        if (!fs.existsSync(vscodeDir)) {
            fs.mkdirSync(vscodeDir, { recursive: true });
        }

        let launchJson: { version: string; configurations: vscode.DebugConfiguration[] };

        if (fs.existsSync(launchJsonPath)) {
            // 读取并解析现有配置（支持 JSONC 格式，即带注释的 JSON）
            const existingConfig = await this.readLaunchJson(launchJsonPath);
            
            if (existingConfig) {
                launchJson = existingConfig;
                
                // 查找是否已存在我们的 STM32 调试配置（通过名称前缀识别）
                const existingIndex = launchJson.configurations.findIndex(c => 
                    c.name && c.name.startsWith('STM32 Debug')
                );
                
                if (existingIndex >= 0) {
                    // 已存在 → 更新
                    launchJson.configurations[existingIndex] = debugConfig;
                } else {
                    // 不存在 → 追加到开头
                    launchJson.configurations.unshift(debugConfig);
                }
            } else {
                // 解析失败，询问用户
                const choice = await vscode.window.showWarningMessage(
                    '现有的 launch.json 格式有问题，是否创建新的配置文件？',
                    '创建新文件',
                    '取消'
                );
                if (choice !== '创建新文件') {
                    return undefined;
                }
                launchJson = {
                    version: '0.2.0',
                    configurations: [debugConfig]
                };
            }
        } else {
            // 文件不存在，创建新的
            launchJson = {
                version: '0.2.0',
                configurations: [debugConfig]
            };
        }

        // 写入文件
        fs.writeFileSync(launchJsonPath, JSON.stringify(launchJson, null, 4), 'utf8');

        if (openFile) {
            const doc = await vscode.workspace.openTextDocument(launchJsonPath);
            await vscode.window.showTextDocument(doc);
        }

        return debugConfig.name;
    }

    /**
     * 读取 launch.json（支持 JSONC 格式，即带注释的 JSON）
     */
    private async readLaunchJson(filePath: string): Promise<{ version: string; configurations: vscode.DebugConfiguration[] } | null> {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            
            // 去除注释后解析
            const cleanContent = this.stripJsonComments(content);
            return JSON.parse(cleanContent);
        } catch (error) {
            console.error('解析 launch.json 失败:', error);
            return null;
        }
    }

    /**
     * 去除 JSON 中的注释
     * 支持单行注释 // 和多行注释
     */
    private stripJsonComments(content: string): string {
        // 状态机：处理字符串内的内容不被误删
        let result = '';
        let inString = false;
        let inSingleComment = false;
        let inMultiComment = false;
        let i = 0;

        while (i < content.length) {
            const char = content[i];
            const nextChar = content[i + 1];

            if (inSingleComment) {
                // 单行注释，遇到换行结束
                if (char === '\n') {
                    inSingleComment = false;
                    result += char;
                }
                i++;
                continue;
            }

            if (inMultiComment) {
                // 多行注释，遇到 星号斜杠 结束
                if (char === '*' && nextChar === '/') {
                    inMultiComment = false;
                    i += 2;
                    continue;
                }
                i++;
                continue;
            }

            if (inString) {
                // 在字符串内
                result += char;
                if (char === '\\' && nextChar) {
                    // 转义字符
                    result += nextChar;
                    i += 2;
                    continue;
                }
                if (char === '"') {
                    inString = false;
                }
                i++;
                continue;
            }

            // 不在字符串内
            if (char === '"') {
                inString = true;
                result += char;
                i++;
                continue;
            }

            if (char === '/' && nextChar === '/') {
                // 单行注释开始
                inSingleComment = true;
                i += 2;
                continue;
            }

            if (char === '/' && nextChar === '*') {
                // 多行注释开始
                inMultiComment = true;
                i += 2;
                continue;
            }

            result += char;
            i++;
        }

        // 去除尾随逗号（JSON 不允许，但 VS Code 的 JSONC 允许）
        result = result.replace(/,(\s*[}\]])/g, '$1');

        return result;
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

        try {
            const configName = await this.generateLaunchJson(false);
            if (!configName) {
                return;
            }

            await vscode.debug.startDebugging(workspaceFolder, configName);
        } catch (error) {
            vscode.window.showErrorMessage(`生成调试配置失败: ${error}`);
        }
    }

    /**
     * 在构建目录中查找 ELF 文件
     */
    private async findElfFile(): Promise<string | undefined> {
        const workspacePath = getWorkspaceFolderSafe();
        if (!workspacePath) {
            return undefined;
        }

        const config = getSTM32Config();
        const buildType = config.buildType;
        
        // 按优先级排序的构建目录
        const priorityDirs = [
            path.join(workspacePath, 'build', buildType),
            path.join(workspacePath, config.buildDirectory, buildType),
        ];
        
        const fallbackDirs = [
            path.join(workspacePath, config.buildDirectory),
            path.join(workspacePath, 'build'),
        ];

        // 先在优先目录中查找
        for (const buildDir of priorityDirs) {
            try {
                const files = await vscode.workspace.findFiles(
                    new vscode.RelativePattern(buildDir, '*.elf'),
                    null,
                    5
                );
                if (files.length === 1) {
                    return files[0].fsPath;
                }
                if (files.length > 1) {
                    return this.promptSelectElfFile(files, workspacePath, buildType);
                }
            } catch {
                // 目录不存在，继续
            }
        }

        // 搜索备选目录
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

        const uniqueFiles = [...new Set(allFiles.map(f => f.fsPath))];
        
        if (uniqueFiles.length === 0) {
            return undefined;
        }

        if (uniqueFiles.length === 1) {
            return uniqueFiles[0];
        }

        // 优先选择当前构建类型的文件
        const buildTypeFile = uniqueFiles.find(f => 
            f.toLowerCase().includes(buildType.toLowerCase())
        );
        if (buildTypeFile) {
            return buildTypeFile;
        }

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

        items.sort((a, b) => (b.isCurrentType ? 1 : 0) - (a.isCurrentType ? 1 : 0));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: `选择要调试的 ELF 文件 (当前构建类型: ${currentBuildType})`
        });

        return selected?.path;
    }

    /**
     * 创建调试配置
     */
    private async createDebugConfig(elfFile: string): Promise<vscode.DebugConfiguration> {
        const config = getSTM32Config();
        const target = getOpenOCDTarget(config.selectedChip);
        const interfaceConfig = getInterfaceConfig(config.debugInterface);

        const ext = process.platform === 'win32' ? '.exe' : '';
        const gdbPath = config.toolchainPath 
            ? path.join(config.toolchainPath, `arm-none-eabi-gdb${ext}`)
            : `arm-none-eabi-gdb${ext}`;

        const openocdScriptsPath = this.getOpenOCDScriptsPath(config.openocdPath);
        const svdFile = config.svdFile || await this.findSvdFile(config.selectedChip);
        const elfPathForOpenOCD = toForwardSlash(elfFile);

        const debugConfig: vscode.DebugConfiguration = {
            type: 'cortex-debug',
            request: 'launch',
            name: `STM32 Debug (${config.selectedChip || 'OpenOCD'})`,
            servertype: 'openocd',
            cwd: '${workspaceFolder}',
            executable: elfFile,
            device: config.selectedChip || undefined,
            configFiles: [
                interfaceConfig,
                `target/${target}.cfg`
            ],
            gdbPath: gdbPath,
            runToEntryPoint: 'main',
            showDevDebugOutput: 'parsed',
            armToolchainPath: config.toolchainPath || undefined,
            
            liveWatch: {
                enabled: true,
                samplesPerSecond: 4
            },

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

        if (config.openocdPath) {
            debugConfig.serverpath = config.openocdPath;
        }

        if (openocdScriptsPath) {
            debugConfig.searchDir = [openocdScriptsPath];
        } else {
            const openocdDir = path.dirname(config.openocdPath || '');
            if (openocdDir) {
                const xpackScripts = path.resolve(openocdDir, '..', 'share', 'openocd', 'scripts');
                debugConfig.searchDir = [xpackScripts];
            }
        }

        if (svdFile) {
            debugConfig.svdFile = svdFile;
        }

        return debugConfig;
    }

    /**
     * 自动查找 SVD 文件
     */
    private async findSvdFile(chipName: string): Promise<string | undefined> {
        const workspacePath = getWorkspaceFolderSafe();
        if (!workspacePath) {
            return undefined;
        }

        try {
            const svdFiles = await vscode.workspace.findFiles(
                '**/*.svd',
                '**/node_modules/**',
                5
            );

            if (svdFiles.length === 1) {
                return svdFiles[0].fsPath;
            }

            if (svdFiles.length > 1) {
                const chipLower = chipName.toLowerCase();
                const matchedSvd = svdFiles.find(f => {
                    const fileName = path.basename(f.fsPath).toLowerCase();
                    return fileName.includes(chipLower) || 
                           chipLower.includes(fileName.replace('.svd', ''));
                });
                if (matchedSvd) {
                    return matchedSvd.fsPath;
                }
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

        const config = getSTM32Config();
        if (config.openocdScriptsPath && fs.existsSync(config.openocdScriptsPath)) {
            return config.openocdScriptsPath;
        }

        const openocdDir = path.dirname(openocdPath);
        const possiblePaths = [
            path.join(openocdDir, '..', 'share', 'openocd', 'scripts'),
            path.join(openocdDir, '..', 'scripts'),
            path.join(openocdDir, 'scripts'),
            path.join(openocdDir, '..', '..', 'share', 'openocd', 'scripts'),
        ];

        for (const scriptsPath of possiblePaths) {
            try {
                const normalizedPath = path.resolve(scriptsPath);
                if (fs.existsSync(normalizedPath)) {
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
}
