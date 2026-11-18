# 列表预加载与多页同时加载（fork 自维护）

上游未合并（PR #153 关闭），本 fork 单独维护。两个开关都在「功能开关」里，默认关闭；关闭时行为与上游完全一致。

## 开关与行为

| 开关 | 设置项 | 开启后 |
|---|---|---|
| 列表预加载 | `enableListPreload` | 13 个分页列表离底 8 屏就请求下一页（`useListPreload`），并隐藏竖向滚动条；不加大 `drawDistance`（真机实测 1500px 让快速滑动掉帧从约 3% 升到 10–17%） |
| 多页同时加载 | `enableParallelPaging` | 个人主页回答、提问、文章、想法按 offset 一次请求 3 页（`fetchOffsetPages`）；登录态推荐流用请求接力队列提前请求下一页（`PageQueue`，深度 1） |

设置版本 v22 加预加载、v23 加多页加载。上游以后升级设置版本时，需要把这两条迁移重新编号到上游之后。

## 与上游分页的衔接

上游推荐流、日报、个人主页用 `useEndReachedPagination`：触底时只发一次请求，忙时排队，加载后列表没变长才最多补请求 3 次。预加载在它之上只改两处：

1. **触发距离**：`endReachedThreshold` 与 FlashList 的 `onEndReachedThreshold` 都改用 `useListPreload` 给出的值。
2. **补请求**：FlashList 只在列表“进入”底部区域时调用一次 `onEndReached`。8 屏的区域能装下好几页，新页到达时阅读位置往往还在区域内，不会再触发，上游的补请求又只在列表没变长时才发，所以分页会停住，直到用户滑到真正的底部。`useLoadMoreNearEnd` 在预加载开启时，每次加载结束后只要仍在区域内就调用上游的 `handleEndReached`，同一滚动位置最多补 3 次。

其余 10 个普通列表没有接入上游的 hook，只改了触发距离。

## 推荐流的阅读反馈与请求接力

- **已读上报**：上游在请求下一页时上报上一页的回答（`lastread/touch`）。预加载提前好几屏请求，这样会把没看到的内容报成已读，所以开启预加载时 `useFeedPageReadTouch(…, reportOnPass)` 不在请求时上报，改由 `useFeedReadTouchOnPass` 处理：后一页的卡片出现在屏幕上（露出一半且停留 800ms，折叠行按其第一张卡片算）时，上报它之前各页的整批回答。
- **请求接力**：推荐游标带 `session_token`，可能参与服务端的推荐会话状态，所以队列只提前请求上一页 `paging.next` 给出的那一页，不推测、不乱序。服务端收到的请求和关闭开关时相同、顺序相同，只是更早发出。只有当前显示的列表维持队列；下拉刷新、关闭开关、切换账号、卸载时清空队列。

## 已知代价

- 每个推荐会话结束时（刷新、退出），最后一页已经提前请求、但没有展示。服务端可能把这页算作已下发。
- 列表的查询被取消时，已从队列取走的那页会被丢弃，下次会用同一游标再请求一次。
- 个人主页 3 页并发更容易触发知乎风控（40362）。

## 回归

`listPreload`、`pageQueue`、`usePageQueue`、`parallelPaging`、`feedReadTouchPass`、`feedPageReadTouch`（reporting on pass）、`userProfileScreen`（多页同时加载）、`featureSettings`、`settings-renderer-migration`。真机需检查开启后快速滑动是否转圈、掉帧（`dumpsys gfxinfo`），以及有没有重复的分页请求。
