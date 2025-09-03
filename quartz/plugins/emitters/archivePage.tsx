import { QuartzEmitterPlugin } from "../types"
import { QuartzComponentProps } from "../../components/types"
import HeaderConstructor from "../../components/Header"
import BodyConstructor from "../../components/Body"
import { pageResources, renderPage } from "../../components/renderPage"
import { ProcessedContent, QuartzPluginData, defaultProcessedContent } from "../vfile"
import { FullPageLayout } from "../../cfg"
import { FullSlug, pathToRoot } from "../../util/path"
import { defaultListPageLayout, sharedPageComponents } from "../../../quartz.layout"
import { ArchiveContent } from "../../components"
import { write } from "./helpers"
import { i18n } from "../../i18n"
import { BuildCtx } from "../../util/ctx"
import { StaticResources } from "../../util/resources"
import * as Component from "../../components"

interface ArchivePageOptions extends FullPageLayout {
    sort?: (f1: QuartzPluginData, f2: QuartzPluginData) => number
}

async function processArchivePage(
    ctx: BuildCtx,
    allFiles: QuartzPluginData[],
    opts: FullPageLayout,
    resources: StaticResources,
) {
    const slug = "archive" as FullSlug
    const cfg = ctx.cfg.configuration

    // 创建归档页面的内容
    const archiveContent = defaultProcessedContent({
        slug: "archive" as FullSlug,
        frontmatter: {
            title: i18n(cfg.locale).pages.archiveContent.title,
            description: i18n(cfg.locale).pages.archiveContent.description
        },
    })

    const [tree, file] = archiveContent
    const externalResources = pageResources(pathToRoot(slug), resources)
    const componentData: QuartzComponentProps = {
        ctx,
        fileData: file.data,
        externalResources,
        cfg,
        children: [],
        tree,
        allFiles,
    }

    const content = renderPage(cfg, slug, componentData, opts, externalResources)
    return write({
        ctx,
        content,
        slug: "archive",
        ext: ".html",
    })
}

export const ArchivePage: QuartzEmitterPlugin<Partial<ArchivePageOptions>> = (userOpts) => {
    const opts: FullPageLayout = {
        ...sharedPageComponents,
        ...defaultListPageLayout,
        pageBody: ArchiveContent({ sort: userOpts?.sort }),
        ...userOpts,
    }

    const { head: Head, header, beforeBody, pageBody, afterBody, left, right, footer: Footer } = opts
    const Header = HeaderConstructor()
    const Body = BodyConstructor()

    return {
        name: "ArchivePage",
        getQuartzComponents() {
            return [
                Head,
                Header,
                Body,
                ...header,
                ...beforeBody,
                pageBody,
                ...afterBody,
                ...left,
                ...right,
                Footer,
            ]
        },
        async *emit(ctx, content, resources) {
            const allFiles = content.map((c) => c[1].data)
            yield processArchivePage(ctx, allFiles, opts, resources)
        },
        async *partialEmit(ctx, content, resources, changeEvents) {
            // 如果有任何文件变化，重新生成归档页面
            if (changeEvents.length > 0) {
                const allFiles = content.map((c) => c[1].data)
                yield processArchivePage(ctx, allFiles, opts, resources)
            }
        },
    }
}
