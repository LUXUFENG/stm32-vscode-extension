import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface DetectedProjectInfo {
    chipName?: string;
    chipFamily?: string;
    projectName?: string;
}

export class ProjectDetector {
    
    /**
     * 自动检测项目中的芯片型号
     */
    async detectChip(): Promise<DetectedProjectInfo> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return {};
        }

        const rootPath = workspaceFolder.uri.fsPath;
        let info: DetectedProjectInfo = {};

        // 1. 尝试从 .ioc 文件检测 (STM32CubeMX 项目)
        info = await this.detectFromIOC(rootPath);
        if (info.chipName) {
            return info;
        }

        // 2. 尝试从 CMakeLists.txt 检测
        info = await this.detectFromCMakeLists(rootPath);
        if (info.chipName) {
            return info;
        }

        // 3. 尝试从启动文件名检测
        info = await this.detectFromStartupFile(rootPath);
        if (info.chipName) {
            return info;
        }

        // 4. 尝试从链接脚本检测
        info = await this.detectFromLinkerScript(rootPath);
        
        return info;
    }

    /**
     * 从 .ioc 文件检测芯片型号
     */
    private async detectFromIOC(rootPath: string): Promise<DetectedProjectInfo> {
        try {
            const files = fs.readdirSync(rootPath);
            const iocFile = files.find(f => f.endsWith('.ioc'));
            
            if (iocFile) {
                const content = fs.readFileSync(path.join(rootPath, iocFile), 'utf8');
                
                // 查找 Mcu.Name 或 Mcu.UserName
                const mcuMatch = content.match(/Mcu\.Name=(\w+)/);
                const userNameMatch = content.match(/Mcu\.UserName=(STM32\w+)/);
                const projectNameMatch = content.match(/ProjectManager\.ProjectName=(\w+)/);
                
                if (mcuMatch || userNameMatch) {
                    const chipName = userNameMatch?.[1] || mcuMatch?.[1] || '';
                    return {
                        chipName: this.normalizeChipName(chipName),
                        chipFamily: this.getChipFamily(chipName),
                        projectName: projectNameMatch?.[1]
                    };
                }
            }
        } catch {
            // 忽略错误
        }
        return {};
    }

    /**
     * 从 CMakeLists.txt 检测芯片型号
     */
    private async detectFromCMakeLists(rootPath: string): Promise<DetectedProjectInfo> {
        const cmakePaths = [
            path.join(rootPath, 'CMakeLists.txt'),
            path.join(rootPath, 'cmake', 'stm32cubemx', 'CMakeLists.txt'),
        ];

        for (const cmakePath of cmakePaths) {
            try {
                if (fs.existsSync(cmakePath)) {
                    const content = fs.readFileSync(cmakePath, 'utf8');
                    
                    // 查找 STM32 定义
                    const patterns = [
                        /set\s*\(\s*MCU_MODEL\s+["']?(STM32\w+)["']?/i,
                        /add_compile_definitions\s*\([^)]*\b(STM32\w+x[BCDEFGHI]?)\b/i,
                        /-D(STM32\w+x[BCDEFGHI]?)\b/i,
                        /target_compile_definitions\s*\([^)]*\b(STM32\w+x[BCDEFGHI]?)\b/i,
                        /STM32_DEVICE\s*=?\s*["']?(STM32\w+)["']?/i,
                    ];

                    for (const pattern of patterns) {
                        const match = content.match(pattern);
                        if (match) {
                            const chipName = match[1];
                            return {
                                chipName: this.normalizeChipName(chipName),
                                chipFamily: this.getChipFamily(chipName)
                            };
                        }
                    }
                }
            } catch {
                // 忽略错误
            }
        }
        return {};
    }

    /**
     * 从启动文件名检测芯片型号
     */
    private async detectFromStartupFile(rootPath: string): Promise<DetectedProjectInfo> {
        try {
            // 搜索启动文件
            const startupFiles = await vscode.workspace.findFiles(
                new vscode.RelativePattern(rootPath, '**/startup_stm32*.s'),
                '**/node_modules/**',
                5
            );

            if (startupFiles.length > 0) {
                const fileName = path.basename(startupFiles[0].fsPath, '.s');
                // startup_stm32f103xb.s -> STM32F103xB
                const match = fileName.match(/startup_(stm32\w+)/i);
                if (match) {
                    const chipName = match[1].toUpperCase();
                    return {
                        chipName: this.normalizeChipName(chipName),
                        chipFamily: this.getChipFamily(chipName)
                    };
                }
            }
        } catch {
            // 忽略错误
        }
        return {};
    }

    /**
     * 从链接脚本检测芯片型号
     */
    private async detectFromLinkerScript(rootPath: string): Promise<DetectedProjectInfo> {
        try {
            const ldFiles = await vscode.workspace.findFiles(
                new vscode.RelativePattern(rootPath, '**/*.ld'),
                '**/node_modules/**',
                5
            );

            for (const ldFile of ldFiles) {
                const fileName = path.basename(ldFile.fsPath, '.ld');
                // STM32F103C8Tx_FLASH.ld -> STM32F103C8
                const match = fileName.match(/(STM32\w+?)(?:Tx|_FLASH|_RAM)?$/i);
                if (match) {
                    const chipName = match[1].toUpperCase();
                    return {
                        chipName: this.normalizeChipName(chipName),
                        chipFamily: this.getChipFamily(chipName)
                    };
                }
            }
        } catch {
            // 忽略错误
        }
        return {};
    }

    /**
     * 规范化芯片名称
     */
    private normalizeChipName(name: string): string {
        // STM32F103xB -> STM32F103CB (假设常见封装)
        // 保留原始格式
        return name.toUpperCase();
    }

    /**
     * 获取芯片系列
     */
    private getChipFamily(chipName: string): string {
        const name = chipName.toUpperCase();
        if (name.startsWith('STM32F0')) return 'STM32F0';
        if (name.startsWith('STM32F1')) return 'STM32F1';
        if (name.startsWith('STM32F2')) return 'STM32F2';
        if (name.startsWith('STM32F3')) return 'STM32F3';
        if (name.startsWith('STM32F4')) return 'STM32F4';
        if (name.startsWith('STM32F7')) return 'STM32F7';
        if (name.startsWith('STM32G0')) return 'STM32G0';
        if (name.startsWith('STM32G4')) return 'STM32G4';
        if (name.startsWith('STM32H7')) return 'STM32H7';
        if (name.startsWith('STM32L0')) return 'STM32L0';
        if (name.startsWith('STM32L1')) return 'STM32L1';
        if (name.startsWith('STM32L4')) return 'STM32L4';
        if (name.startsWith('STM32L5')) return 'STM32L5';
        if (name.startsWith('STM32U5')) return 'STM32U5';
        if (name.startsWith('STM32WB')) return 'STM32WB';
        if (name.startsWith('STM32WL')) return 'STM32WL';
        return '';
    }
}

/**
 * 快速选择调试器类型
 */
export async function selectDebugInterface(): Promise<string | undefined> {
    const interfaces = [
        { label: 'ST-Link', description: '官方调试器', value: 'stlink' },
        { label: 'ST-Link V2', description: 'ST-Link V2', value: 'stlink-v2' },
        { label: 'ST-Link V2-1', description: 'ST-Link V2-1 (Nucleo 板载)', value: 'stlink-v2-1' },
        { label: 'ST-Link V3', description: 'ST-Link V3', value: 'stlink-v3' },
        { label: 'J-Link', description: 'Segger J-Link', value: 'jlink' },
        { label: 'CMSIS-DAP', description: 'CMSIS-DAP 兼容调试器', value: 'cmsis-dap' },
        { label: 'DAP-Link', description: 'DAP-Link 调试器', value: 'cmsis-dap' },
    ];

    const selected = await vscode.window.showQuickPick(interfaces, {
        placeHolder: '选择调试器类型',
        title: '调试器接口'
    });

    if (selected) {
        const config = vscode.workspace.getConfiguration('stm32');
        await config.update('debugInterface', selected.value, vscode.ConfigurationTarget.Workspace);
        return selected.value;
    }
    return undefined;
}

/**
 * 快速选择构建类型 - 直接调用 CMake Tools 的预设选择
 */
export async function selectBuildType(): Promise<string | undefined> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const hasCMakePresets = workspaceFolder && 
        fs.existsSync(path.join(workspaceFolder.uri.fsPath, 'CMakePresets.json'));
    
    if (hasCMakePresets) {
        // 使用 CMakePresets.json 的项目 - 直接调用 CMake Tools 选择
        try {
            await vscode.commands.executeCommand('cmake.selectConfigurePreset');
            
            // CMake Tools 选择完成后，多次尝试同步状态
            // 因为 CMake 配置可能需要一些时间
            const syncAttempts = [500, 1500, 3000];
            for (const delay of syncAttempts) {
                setTimeout(async () => {
                    await syncBuildTypeFromCMakeTools();
                }, delay);
            }
            
            return undefined; // 异步更新
        } catch (e) {
            console.log('cmake.selectConfigurePreset failed:', e);
        }
    }
    
    // 非预设项目：使用我们自己的选择界面
    const currentBuildType = vscode.workspace.getConfiguration('stm32').get<string>('buildType') || 'Debug';
    
    const buildTypes = [
        { label: '$(bug) Debug', description: '调试版本 (含调试信息，无优化)', value: 'Debug' },
        { label: '$(package) Release', description: '发布版本 (优化性能)', value: 'Release' },
        { label: '$(debug) RelWithDebInfo', description: '带调试信息的发布版本', value: 'RelWithDebInfo' },
        { label: '$(file-zip) MinSizeRel', description: '最小体积发布版本', value: 'MinSizeRel' },
    ];

    const items = buildTypes.map(bt => ({
        ...bt,
        label: bt.value === currentBuildType ? `$(check) ${bt.label}` : bt.label
    }));

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: `当前: ${currentBuildType}`,
        title: '构建配置'
    });

    if (selected) {
        const stm32Config = vscode.workspace.getConfiguration('stm32');
        await stm32Config.update('buildType', selected.value, vscode.ConfigurationTarget.Workspace);
        
        // 非预设项目，尝试设置 cmake.buildType
        try {
            const cmakeConfig = vscode.workspace.getConfiguration('cmake');
            await cmakeConfig.update('buildType', selected.value, vscode.ConfigurationTarget.Workspace);
        } catch {
            // 忽略
        }
        
        return selected.value;
    }
    return undefined;
}

/**
 * 从 CMake Tools 的缓存中同步构建类型
 */
async function syncBuildTypeFromCMakeTools(): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return;

    const workspacePath = workspaceFolder.uri.fsPath;

    // 方法1：检查 CMake Tools 的 settings 缓存
    const cmakeSettingsPath = path.join(workspacePath, '.vscode', 'cmake-tools-kits.json');
    
    // 方法2：检查最近修改的构建目录
    const buildDirs = ['Debug', 'Release', 'RelWithDebInfo', 'MinSizeRel'];
    let latestDir = '';
    let latestTime = 0;

    for (const dir of buildDirs) {
        const buildPath = path.join(workspacePath, 'build', dir);
        try {
            const stats = fs.statSync(buildPath);
            if (stats.isDirectory() && stats.mtimeMs > latestTime) {
                latestTime = stats.mtimeMs;
                latestDir = dir;
            }
        } catch {
            // 目录不存在
        }
    }

    if (latestDir) {
        // 使用最近修改的目录作为当前构建类型
        await updateBuildType(latestDir);
        return;
    }

    // 方法3：检查 CMakeCache.txt 内容
    const cmakeCachePaths = [
        path.join(workspacePath, 'build', 'Debug', 'CMakeCache.txt'),
        path.join(workspacePath, 'build', 'Release', 'CMakeCache.txt'),
        path.join(workspacePath, 'build', 'CMakeCache.txt'),
    ];

    for (const cachePath of cmakeCachePaths) {
        if (fs.existsSync(cachePath)) {
            // 从路径推断构建类型
            const dirName = path.basename(path.dirname(cachePath));
            if (['Debug', 'Release', 'RelWithDebInfo', 'MinSizeRel'].includes(dirName)) {
                await updateBuildType(dirName);
                return;
            }
            
            // 从缓存内容读取
            try {
                const content = fs.readFileSync(cachePath, 'utf8');
                const match = content.match(/CMAKE_BUILD_TYPE:STRING=(\w+)/);
                if (match && match[1]) {
                    await updateBuildType(match[1]);
                    return;
                }
            } catch {
                // 忽略
            }
        }
    }
}

async function updateBuildType(buildType: string): Promise<void> {
    // 标准化构建类型名称
    const normalized = buildType.charAt(0).toUpperCase() + buildType.slice(1).toLowerCase();
    const validTypes = ['Debug', 'Release', 'Relwithdebinfo', 'Minsizerel'];
    const finalType = validTypes.find(t => t.toLowerCase() === normalized.toLowerCase()) || buildType;

    const stm32Config = vscode.workspace.getConfiguration('stm32');
    const current = stm32Config.get<string>('buildType');
    
    if (current !== finalType) {
        await stm32Config.update('buildType', finalType, vscode.ConfigurationTarget.Workspace);
        vscode.window.setStatusBarMessage(`构建类型: ${finalType}`, 3000);
    }
}

