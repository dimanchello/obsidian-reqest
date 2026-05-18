import { Plugin, WorkspaceLeaf, TFile, MarkdownView, MarkdownPostProcessorContext } from 'obsidian'
import * as React from 'react'
import { createRoot, Root } from 'react-dom/client'
import { App } from './ui/App'
import { loadCollection, saveCollection, renameCollection, DEFAULT_COLLECTION_DATA, CollectionData, getCollectionNameFromNotePath } from './storage'

export const VIEW_TYPE_REQUEST_COLLECTION = 'request-collection-view'

class RequestCollectionView extends MarkdownView {
    root: Root | null = null
    plugin: ObsidianRequestPlugin
    collectionData: CollectionData

    constructor(leaf: WorkspaceLeaf, plugin: ObsidianRequestPlugin) {
        super(leaf)
        this.plugin = plugin
        this.collectionData = DEFAULT_COLLECTION_DATA
    }

    getViewType(): string {
        return VIEW_TYPE_REQUEST_COLLECTION
    }

    getDisplayText(): string {
        return this.file ? `Request: ${this.file.basename}` : 'Request Collection'
    }

    getCollectionName(): string {
        return this.file ? getCollectionNameFromNotePath(this.file.path) : 'request-collection'
    }

    async onLoadFile(file: TFile): Promise<void> {
        await super.onLoadFile(file)
        await this.loadCollection()
        this.renderReact()
    }

    async loadCollection(): Promise<void> {
        this.collectionData = await loadCollection(this.app, this.getCollectionName())
    }

    async handleSaveData(newData: CollectionData): Promise<void> {
        this.collectionData = newData
        await saveCollection(this.app, this.getCollectionName(), newData)
    }

    renderReact(): void {
        const container = this.contentEl
        container.empty()

        const reactRoot = container.createDiv({ cls: 'obsidian-request-root', attr: { style: 'height: 100%; width: 100%;' } })
        if (!this.root) {
            this.root = createRoot(reactRoot)
        }

        this.root.render(
            React.createElement(App, {
                data: this.collectionData,
                onSave: (newData: CollectionData) => this.handleSaveData(newData),
                collectionName: this.getCollectionName()
            })
        )
    }

    async onClose(): Promise<void> {
        if (this.root) {
            this.root.unmount()
            this.root = null
        }
        await super.onClose()
    }
}

export default class ObsidianRequestPlugin extends Plugin {
    async onload(): Promise<void> {
        this.registerView(VIEW_TYPE_REQUEST_COLLECTION, (leaf) => new RequestCollectionView(leaf, this))

        this.registerMarkdownCodeBlockProcessor('request-collection', this.handleCodeBlock.bind(this))

        this.registerEvent(
            this.app.vault.on('rename', (file: TFile, oldPath: string) => {
                if (file.extension === 'md') {
                    const oldName = getCollectionNameFromNotePath(oldPath)
                    const newName = getCollectionNameFromNotePath(file.path)
                    if (oldName !== newName) {
                        renameCollection(this.app, oldName, newName)
                    }
                }
            })
        )

        this.registerEvent(
            this.app.vault.on('delete', (file: TFile) => {
                if (file.extension === 'md') {
                    const collectionName = getCollectionNameFromNotePath(file.path)
                    this.app.vault.adapter.exists(`${this.app.vault.adapter.getBasePath()}/collections/${collectionName}.json`).then(exists => {
                        if (exists) {
                            import('./storage').then(mod => mod.deleteCollection(this.app, collectionName))
                        }
                    })
                }
            })
        )

        this.addRibbonIcon('zap', 'Open Request Collection', async () => {
            const file = this.app.workspace.getActiveFile()
            if (file && file.extension === 'md') {
                await this.openCollectionForFile(file)
            }
        })

        this.addCommand({
            id: 'open-request-collection',
            name: 'Open request collection for current note',
            checkCallback: (checking: boolean) => {
                const file = this.app.workspace.getActiveFile()
                if (file && file.extension === 'md') {
                    if (!checking) {
                        this.openCollectionForFile(file)
                    }
                    return true
                }
                return false
            }
        })
    }

    handleCodeBlock(_source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
        const collectionName = getCollectionNameFromNotePath(ctx.sourcePath)

        const container = el.createDiv({ cls: 'obsidian-request-embed', attr: { style: 'height: 600px; border: 1px solid var(--background-modifier-border); border-radius: 4px;' } })

        const reactRoot = container.createDiv({ cls: 'obsidian-request-root', attr: { style: 'height: 100%; width: 100%;' } })
        const root = createRoot(reactRoot)

        loadCollection(this.app, collectionName).then(data => {
            root.render(
                React.createElement(App, {
                    data: data,
                    onSave: async (newData: CollectionData) => {
                        await saveCollection(this.app, collectionName, newData)
                    },
                    collectionName: collectionName
                })
            )
        })

        ctx.addChild({
            containerEl: el,
            onload: () => {},
            onunload: () => {
                root.unmount()
            }
        })
    }

    async openCollectionForFile(file: TFile): Promise<void> {
        const leaf = this.app.workspace.getMostRecentLeaf()
        if (leaf) {
            await leaf.setViewState({
                type: VIEW_TYPE_REQUEST_COLLECTION,
                state: { file: file.path }
            })
        }
    }
}
