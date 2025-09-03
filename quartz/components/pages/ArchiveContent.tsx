import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "../types"
import style from "../styles/listPage.scss"
import archiveStyle from "../styles/archivePage.scss"
import { PageList, SortFn } from "../PageList"
import { QuartzPluginData } from "../../plugins/vfile"
import { i18n } from "../../i18n"
import { concatenateResources } from "../../util/resources"
import { getDate } from "../Date"

interface ArchiveContentOptions {
    sort?: SortFn
    numPages: number
}

const defaultOptions: ArchiveContentOptions = {
    numPages: 50,
}

export default ((opts?: Partial<ArchiveContentOptions>) => {
    const options: ArchiveContentOptions = { ...defaultOptions, ...opts }

    const ArchiveContent: QuartzComponent = (props: QuartzComponentProps) => {
        const { tree, fileData, allFiles, cfg } = props
        const slug = fileData.slug

        if (!(slug?.startsWith("archive/") || slug === "archive")) {
            throw new Error(`Component "ArchiveContent" tried to render a non-archive page: ${slug}`)
        }

        // 过滤文章文件 - 简化过滤逻辑
        const articleFiles = allFiles.filter((file) => {
            // 只排除明显的非文章文件
            return file.slug &&
                file.slug !== "index" &&
                file.slug !== "archive" &&
                !file.slug.startsWith("tags/") &&
                file.frontmatter?.title &&
                file.frontmatter.title !== "文章归档"
        })

        // 按年份分组
        const groupedByYear = new Map<number, QuartzPluginData[]>()

        articleFiles.forEach((file) => {
            const date = getDate(cfg, file)
            if (date) {
                const year = date.getFullYear()
                if (!groupedByYear.has(year)) {
                    groupedByYear.set(year, [])
                }
                groupedByYear.get(year)!.push(file)
            }
        })

        // 按年份排序（降序）
        const sortedYears = Array.from(groupedByYear.keys()).sort((a, b) => b - a)

        return (
            <div class="popover-hint">
                <div class="back-to-home">
                    <a href="/" class="internal">
                        ← 返回主页
                    </a>
                </div>

                <div class="archive-header">
                    <h1>{i18n(cfg.locale).pages.archiveContent.title}</h1>
                    <p>{i18n(cfg.locale).pages.archiveContent.description}</p>
                </div>

                <div class="archive-stats">
                    <p>{i18n(cfg.locale).pages.archiveContent.totalArticles({ count: articleFiles.length })}</p>
                    <p>找到 {sortedYears.length} 个年份</p>
                </div>

                {sortedYears.length === 0 ? (
                    <div class="no-articles">
                        <p>暂无文章或文章没有日期信息</p>
                        <p>Debug: 总文件数 {allFiles.length}, 文章文件数 {articleFiles.length}</p>
                    </div>
                ) : (
                    sortedYears.map((year) => {
                        const yearFiles = groupedByYear.get(year)!
                        // 按日期排序（降序）
                        yearFiles.sort((a, b) => {
                            const dateA = getDate(cfg, a)
                            const dateB = getDate(cfg, b)
                            if (dateA && dateB) {
                                return dateB.getTime() - dateA.getTime()
                            }
                            return 0
                        })

                        const listProps = {
                            ...props,
                            allFiles: yearFiles,
                        }

                        return (
                            <div class="year-group">
                                <h2 class="year-title">{year}</h2>
                                <div class="page-listing">
                                    <p>{i18n(cfg.locale).pages.archiveContent.articlesInYear({ year, count: yearFiles.length })}</p>
                                    <PageList limit={options.numPages} {...listProps} />
                                </div>
                            </div>
                        )
                    })
                )}
            </div>
        )
    }

    ArchiveContent.css = concatenateResources(style, archiveStyle, PageList.css)
    return ArchiveContent
}) satisfies QuartzComponentConstructor
