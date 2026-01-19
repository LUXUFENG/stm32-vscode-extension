/**
 * STM32 芯片选择器
 * 从 JSON 配置文件加载芯片数据库
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * STM32 芯片信息接口
 */
export interface STM32Chip {
    name: string;
    family: string;
    core: string;
    flashSize: string;
    ramSize: string;
    openocdTarget: string;
    svdFile?: string;
}

/**
 * 芯片数据库 JSON 结构
 */
interface ChipDatabase {
    version: string;
    chips: STM32Chip[];
}

export class STM32ChipSelector {
    private context: vscode.ExtensionContext;
    private chips: STM32Chip[] = [];
    private loaded: boolean = false;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.loadChipDatabase();
    }

    /**
     * 加载芯片数据库
     */
    private loadChipDatabase(): void {
        try {
            // 从扩展资源目录加载 JSON 文件
            const jsonPath = path.join(this.context.extensionPath, 'resources', 'chips', 'stm32-chips.json');
            
            if (fs.existsSync(jsonPath)) {
                const content = fs.readFileSync(jsonPath, 'utf8');
                const database: ChipDatabase = JSON.parse(content);
                this.chips = database.chips;
                this.loaded = true;
                console.log(`已加载 ${this.chips.length} 款 STM32 芯片`);
            } else {
                console.warn('芯片数据库文件不存在，使用内置数据');
                this.chips = this.getBuiltinChips();
                this.loaded = true;
            }
        } catch (error) {
            console.error('加载芯片数据库失败:', error);
            this.chips = this.getBuiltinChips();
            this.loaded = true;
        }
    }

    /**
     * 内置芯片数据（作为后备）
     */
    private getBuiltinChips(): STM32Chip[] {
        return [
            { name: 'STM32F103C8', family: 'STM32F1', core: 'Cortex-M3', flashSize: '64KB', ramSize: '20KB', openocdTarget: 'stm32f1x' },
            { name: 'STM32F103CB', family: 'STM32F1', core: 'Cortex-M3', flashSize: '128KB', ramSize: '20KB', openocdTarget: 'stm32f1x' },
            { name: 'STM32F407VG', family: 'STM32F4', core: 'Cortex-M4', flashSize: '1MB', ramSize: '192KB', openocdTarget: 'stm32f4x' },
            { name: 'STM32F411CE', family: 'STM32F4', core: 'Cortex-M4', flashSize: '512KB', ramSize: '128KB', openocdTarget: 'stm32f4x' },
            { name: 'STM32H743ZI', family: 'STM32H7', core: 'Cortex-M7', flashSize: '2MB', ramSize: '1MB', openocdTarget: 'stm32h7x' },
        ];
    }

    /**
     * 选择芯片（交互式）
     */
    async selectChip(): Promise<STM32Chip | undefined> {
        if (!this.loaded) {
            this.loadChipDatabase();
        }

        // 先选择系列
        const families = this.getChipFamilies();
        
        const selectedFamily = await vscode.window.showQuickPick(families, {
            placeHolder: '选择 STM32 系列',
            title: 'STM32 芯片选择'
        });

        if (!selectedFamily) {
            return undefined;
        }

        // 再选择具体型号
        const chipsInFamily = this.chips.filter(c => c.family === selectedFamily);
        const chipItems = chipsInFamily.map(chip => ({
            label: chip.name,
            description: `${chip.core} | Flash: ${chip.flashSize} | RAM: ${chip.ramSize}`,
            chip: chip
        }));

        const selectedItem = await vscode.window.showQuickPick(chipItems, {
            placeHolder: '选择具体型号',
            title: `${selectedFamily} 系列芯片`
        });

        if (!selectedItem) {
            return undefined;
        }

        // 保存选择
        const config = vscode.workspace.getConfiguration('stm32');
        await config.update('selectedChip', selectedItem.chip.name, vscode.ConfigurationTarget.Workspace);
        
        // 保存芯片详细信息到工作区状态
        this.context.workspaceState.update('stm32.chipInfo', selectedItem.chip);

        return selectedItem.chip;
    }

    /**
     * 根据名称获取芯片
     */
    getChipByName(name: string): STM32Chip | undefined {
        if (!this.loaded) {
            this.loadChipDatabase();
        }
        return this.chips.find(c => c.name.toUpperCase() === name.toUpperCase());
    }

    /**
     * 获取当前选择的芯片
     */
    getCurrentChip(): STM32Chip | undefined {
        const config = vscode.workspace.getConfiguration('stm32');
        const chipName = config.get<string>('selectedChip');
        if (chipName) {
            return this.getChipByName(chipName);
        }
        return undefined;
    }

    /**
     * 获取所有芯片
     */
    getAllChips(): STM32Chip[] {
        if (!this.loaded) {
            this.loadChipDatabase();
        }
        return this.chips;
    }

    /**
     * 获取所有芯片系列
     */
    getChipFamilies(): string[] {
        if (!this.loaded) {
            this.loadChipDatabase();
        }
        return [...new Set(this.chips.map(c => c.family))].sort();
    }

    /**
     * 添加自定义芯片（运行时）
     */
    addCustomChip(chip: STM32Chip): void {
        // 检查是否已存在
        const existing = this.chips.findIndex(c => c.name.toUpperCase() === chip.name.toUpperCase());
        if (existing >= 0) {
            this.chips[existing] = chip;
        } else {
            this.chips.push(chip);
        }
    }

    /**
     * 重新加载芯片数据库
     */
    reload(): void {
        this.loaded = false;
        this.loadChipDatabase();
    }
}
