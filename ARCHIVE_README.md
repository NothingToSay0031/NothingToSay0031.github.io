# 文章归档页面

## 功能说明

这个归档页面按照时间顺序整理了所有的文章，主要功能包括：

1. **按年份分组**：所有文章按年份进行分组显示
2. **时间排序**：每个年份内的文章按日期降序排列（最新的在前）
3. **文章统计**：显示总文章数量和每年文章数量
4. **导航链接**：从主页可以方便地访问归档页面

## 文件结构

```
quartz/
├── components/
│   ├── pages/
│   │   └── ArchiveContent.tsx    # 归档页面组件
│   └── styles/
│       └── archivePage.scss      # 归档页面样式
├── plugins/
│   └── emitters/
│       └── archivePage.tsx       # 归档页面插件
└── i18n/
    └── locales/
        ├── zh-CN.ts              # 中文语言包
        └── en-US.ts              # 英文语言包
```

## 使用方法

### 1. 访问归档页面

- 从主页点击"文章归档"链接
- 直接访问 `/archive` 路径

### 2. 浏览文章

- 页面按年份分组显示所有文章
- 每个年份下显示该年的文章列表
- 点击文章标题查看文章详情
- 点击标签查看相关文章

### 3. 自定义配置

可以在 `quartz.config.ts` 中配置归档页面：

```typescript
Plugin.ArchivePage({
  // 自定义排序函数
  sort: (f1, f2) => {
    // 自定义排序逻辑
  }
})
```

## 样式定制

归档页面的样式可以通过修改 `quartz/components/styles/archivePage.scss` 文件来自定义：

- `.year-group`: 年份分组样式
- `.year-title`: 年份标题样式
- `.archive-header`: 页面头部样式
- `.archive-stats`: 统计信息样式

## 国际化支持

支持中英文双语显示，相关文本在语言包中配置：

- 中文：`quartz/i18n/locales/zh-CN.ts`
- 英文：`quartz/i18n/locales/en-US.ts`

## 注意事项

1. 只有有日期的文章才会显示在归档页面中
2. 文章按修改日期（或创建日期）进行排序
3. 归档页面会自动排除标签页、文件夹页等非文章内容
4. 当有新文章添加或文章更新时，归档页面会自动重建
