import { Plugin, TFile, MarkdownPostProcessorContext, MarkdownRenderChild, Editor } from 'obsidian'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './ui/App'
import { loadCollection, saveCollection, renameCollection, deleteCollection, getCollectionNameFromNotePath, getCollectionsDir } from './storage'
import { CollectionData } from './types'

function hasRequestCollectionBlock(content: string): boolean {
    return /^```request-collection\s*$/m.test(content)
}

export default class ObsidianRequestPlugin extends Plugin {
    getPluginDir(): string {
        return this.manifest.dir!
    }

    async onload(): Promise<void> {
        this.registerMarkdownCodeBlockProcessor('request-collection', this.handleCodeBlock.bind(this))

        this.addCommand({
            id: 'insert-request-collection',
            name: 'Insert Request Collection Template',
            editorCallback: (editor: Editor) => {
                const template = '```request-collection\n\n```'
                const doc = editor.getDoc()
                const currentLine = doc.getCursor().line
                const lineContent = doc.getLine(currentLine)

                if (lineContent.trim() === '') {
                    doc.setLine(currentLine, template)
                    doc.setCursor({ line: currentLine, ch: template.indexOf('\n\n') + 1 })
                } else {
                    doc.replaceRange(`${template}\n`, doc.getCursor())
                }
            }
        })

        this.registerEvent(
            this.app.vault.on('rename', async (file, oldPath) => {
                const tf = file as TFile
                if (tf.extension !== 'md') return
                const content = await this.app.vault.read(tf)
                if (!hasRequestCollectionBlock(content)) return

                const oldName = getCollectionNameFromNotePath(oldPath)
                const newName = getCollectionNameFromNotePath(tf.path)
                if (oldName !== newName) {
                    renameCollection(this.app, this.getPluginDir(), oldName, newName)
                }
            })
        )

        this.registerEvent(
            this.app.vault.on('delete', async (file) => {
                const tf = file as TFile
                if (tf.extension !== 'md') return
                const content = await this.app.vault.read(tf)
                if (!hasRequestCollectionBlock(content)) return

                const collectionName = getCollectionNameFromNotePath(tf.path)
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
        let unmounted = false

        loadCollection(this.app, pluginDir, collectionName).then(data => {
            if (unmounted) return
            root.render(
                React.createElement(App, {
                    data,
                    onSave: async (newData: CollectionData) => {
                        await saveCollection(this.app, pluginDir, collectionName, newData)
                    },
                    collectionName
                })
            )
        })

        ctx.addChild(new (class extends MarkdownRenderChild {
            onunload() {
                unmounted = true
                root.unmount()
            }
        })(el))
    }
}
