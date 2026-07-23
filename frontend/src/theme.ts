/**
 * Claude 风格 Ant Design 主题
 * 灵感: https://design.hagicode.com/ja-JP/designs/claude
 */

export const claudeTheme = {
  token: {
    // ── 品牌色 ──
    colorPrimary: '#c96442',          // Terracotta — Claude标志性陶土红
    colorPrimaryHover: '#d97757',     // Coral — 悬停态
    colorPrimaryActive: '#b04d2e',    // 按压态
    colorLink: '#c96442',             // 链接色
    colorLinkHover: '#d97757',

    // ── 背景色 ──
    colorBgBase: '#f5f4ed',           // Parchment — 暖调羊皮纸底色
    colorBgContainer: '#faf9f5',      // Ivory — 卡片/容器
    colorBgElevated: '#ffffff',       // 弹出层
    colorBgLayout: '#f5f4ed',         // 布局背景

    // ── 文字色 ──
    colorTextBase: '#141413',         // Warm near-black — 主文字
    colorTextSecondary: '#5e5d59',    // Olive gray — 次要文字
    colorTextTertiary: '#87867f',     // Stone gray — 第三级文字
    colorTextQuaternary: '#b0aea5',   // Warm silver — 禁用文字

    // ── 边框 ──
    colorBorder: '#e8e6dc',           // Warm cream — 边框
    colorBorderSecondary: '#f0eee6',  // 更浅的边框
    colorSplit: '#e8e6dc',           // 分割线

    // ── 圆角 ──
    borderRadius: 8,
    borderRadiusLG: 12,
    borderRadiusSM: 6,

    // ── 间距 ──
    padding: 16,
    paddingLG: 24,
    paddingSM: 12,
    margin: 16,
    marginLG: 24,
    marginSM: 12,

    // ── 阴影 ──
    boxShadow: '0 1px 2px 0 rgba(0,0,0,0.03), 0 1px 6px -1px rgba(0,0,0,0.02), 0 2px 4px 0 rgba(0,0,0,0.02)',
    boxShadowSecondary: '0 4px 12px 0 rgba(0,0,0,0.05), 0 2px 4px 0 rgba(0,0,0,0.02)',
    boxShadowTertiary: '0 1px 2px 0 rgba(0,0,0,0.02)',

    // ── 字号 ──
    fontSize: 14,
    fontSizeLG: 16,
    fontSizeSM: 12,
    fontSizeHeading1: 28,
    fontSizeHeading2: 22,
    fontSizeHeading3: 18,
    fontSizeHeading4: 16,
    fontSizeHeading5: 14,

    // ── 字重 ──
    fontWeightStrong: 600,

    // ── 行高 ──
    lineHeight: 1.6,
    lineHeightHeading1: 1.3,
    lineHeightHeading2: 1.35,
    lineHeightHeading3: 1.4,

    // ── 控制组件 ──
    controlHeight: 36,
    controlHeightLG: 44,
    controlHeightSM: 28,

    // ── 其他 ──
    colorSuccess: '#4d7c3f',          // 暖调绿
    colorWarning: '#b8862d',          // 暖调黄
    colorError: '#b53333',            // Warm red
    colorInfo: '#c96442',
    colorBgMask: 'rgba(20, 20, 19, 0.45)',
  },

  components: {
    Layout: {
      headerBg: '#faf9f5',
      headerPadding: '0 24px',
      bodyBg: '#f5f4ed',
      siderBg: '#30302e',            // Dark warm sidebar
      triggerBg: '#30302e',
      triggerHeight: 48,
    },
    Menu: {
      itemBg: 'transparent',
      itemColor: '#b0aea5',
      itemHoverColor: '#faf9f5',
      itemHoverBg: 'rgba(255,255,255,0.06)',
      itemSelectedColor: '#faf9f5',
      itemSelectedBg: '#c96442',
      itemActiveBg: 'rgba(201,100,66,0.15)',
      subMenuItemBg: 'transparent',
      collapsedIconSize: 18,
      iconSize: 18,
      itemHeight: 44,
      itemMarginInline: 8,
      itemBorderRadius: 8,
    },
    Card: {
      paddingLG: 20,
      paddingSM: 12,
      headerBg: 'transparent',
      headerFontSize: 15,
      headerHeight: 48,
      actionsBg: '#faf9f5',
    },
    Table: {
      headerBg: '#f5f4ed',
      headerColor: '#5e5d59',
      headerSortActiveBg: '#e8e6dc',
      headerSortHoverBg: '#e8e6dc',
      rowHoverBg: '#f0eee6',
      borderColor: '#f0eee6',
      padding: 12,
      paddingSM: 8,
    },
    Button: {
      primaryShadow: 'none',
      dangerColor: '#b53333',
      borderColorDisabled: '#e8e6dc',
      colorTextDisabled: '#b0aea5',
    },
    Tag: {
      lineHeight: 22,
    },
    Tabs: {
      inkBarColor: '#c96442',
      itemColor: '#87867f',
      itemHoverColor: '#5e5d59',
      itemSelectedColor: '#141413',
    },
    Modal: {
      headerBg: '#faf9f5',
      contentBg: '#faf9f5',
      footerBg: '#faf9f5',
    },
    Input: {
      colorBgContainer: '#ffffff',
      colorBorder: '#e8e6dc',
      hoverBorderColor: '#c96442',
      activeBorderColor: '#c96442',
      activeShadow: '0 0 0 2px rgba(201,100,66,0.1)',
    },
    Select: {
      colorBgContainer: '#ffffff',
      colorBorder: '#e8e6dc',
      hoverBorderColor: '#c96442',
    },
    Form: {
      labelColor: '#5e5d59',
    },
    Tooltip: {
      colorBgSpotlight: '#30302e',
    },
    Badge: {
      colorSuccess: '#4d7c3f',
    },
    Switch: {
      colorPrimary: '#c96442',
    },
  },
}

export default claudeTheme
