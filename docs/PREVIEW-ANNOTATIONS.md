# Comment on a project preview

In a Code chat, enter `/preview`, start a supported local preview, then choose **Comment on preview**. Click the part you want to change. You can also focus the selection area, move with the arrow keys, and press Enter. Escape cancels.

Write your comment and choose **Add to draft**. MuseBench adds the page, selected element and a short excerpt to the current chat's editable draft. Your existing text, images, files and conversation mode stay in place. Review the draft and send it when ready.

Selecting a button or link does not activate it. Cancel selection to use or scroll the preview normally. A page reload, navigation, chat switch or changed element requires a new selection. Your comment stays available when a selection becomes stale. A draft that would exceed 16,000 characters is left unchanged.

This works with the local Code project preview. The browser demonstration includes a sample project using the same controls. Personal Muse/Meta websites, remote pages, Work artifacts and the contents of nested frames are outside this feature.

The capture contains a structural selector, page URL without query or fragment, a short title, a visible text excerpt and the element's viewport rectangle. It does not read form values, editable text, cookies, storage or full HTML. Captures are temporary; only feedback you add becomes part of a saved draft. Page content is labelled as untrusted evidence.

Clipped or partially visible characters are omitted. Text using nonrectangular clipping or masks is also omitted when visibility cannot be established. Very large elements produce a short bounded excerpt.

## Implementation and validation boundary

The desktop inspects only the current project's direct child frame through a fixed function using [Electron's frame API](https://www.electronjs.org/docs/latest/api/web-frame-main). [Frame navigation events](https://www.electronjs.org/docs/latest/api/web-contents) invalidate pending selections. The public interface never accepts JavaScript or a selector to execute. Existing sandbox, navigation policy and top-level IPC checks remain active.

No provider request is made by selecting, writing or adding a comment. Local browser/Electron checks and the real tutorial-server test exercise the implementation without a model. They do not demonstrate provider interpretation of the feedback.
