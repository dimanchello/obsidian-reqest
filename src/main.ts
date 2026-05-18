import { Plugin, TFile, MarkdownPostProcessorContext } from 'obsidian'
import * as React from 'react'
import { createRoot, Root } from 'react-dom/client'
import { App } from './ui/App'
import { loadCollection, saveCollection, renameCollection, deleteCollection, CollectionData, getCollectionNameFromNotePath, getCollectionsDir } from './storage'

function hasRequestCollectionBlock(content: string): boolean {
    return /^```request-collection\s*$/m.test(content)
}

export default class ObsidianRequestPlugin extends Plugin {
    getPluginDir(): string {
        return this.manifest.dir
    }

    async onload(): Promise<void> {
        this.registerMarkdownCodeBlockProcessor('request-collection', this.handleCodeBlock.bind(this))

        this.registerEvent(
            this.app.vault.on('rename', async (file: TFile, oldPath: string) => {
                if (file.extension !== 'md') return
                const content = await this.app.vault.read(file)
                if (!hasRequestCollectionBlock(content)) return

                const oldName = getCollectionNameFromNotePath(oldPath)
                const newName = getCollectionNameFromNotePath(file.path)
                if (oldName !== newName) {
                    renameCollection(this.app, this.getPluginDir(), oldName, newName)
                }
            })
        )

        this.registerEvent(
            this.app.vault.on('delete', async (file: TFile) => {
                if (file.extension !== 'md') return
                const content = await this.app.vault.read(file)
                if (!hasRequestCollectionBlock(content)) return

                const collectionName = getCollectionNameFromNotePath(file.path)
                const filePath = `${getCollectionsDir(this.getPluginDir())}/${collectionName}.json`
                const exists = await this.app.vault.adapter.exists(filePath)
                if (exists) {
                    deleteCollection(this.app, this.getPluginDir(), collectionName)
                }
            })
        )
    }

    handleCodeBlock(_source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
        const collectionName = getCollectionNameFromNotePath(ctx.sourcePath)
        const pluginDir = this.getPluginDir()

        const container = el.createDiv({ cls: 'obsidian-request-embed', attr: { style: 'height: 600px; border: 1px solid var(--background-modifier-border); border-radius: 4px;' } })

        const reactRoot = container.createDiv({ cls: 'obsidian-request-root', attr: { style: 'height: 100%; width: 100%;' } })
        const root = createRoot(reactRoot)

        loadCollection(this.app, pluginDir, collectionName).then(data => {
            root.render(
                React.createElement(App, {
                    data: data,
                    onSave: async (newData: CollectionData) => {
                        await saveCollection(this.app, pluginDir, collectionName, newData)
                    },
                    collectionName: collectionName
                })
            )
        })

        ctx.addChild({
            containerEl: el,
            load: () => {},
            unload: () => {
                root.unmount()
            }
        })
    }
}
