const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/docx-preview-C79XdO1T.js","assets/rolldown-runtime-C0FnF6B9.js","assets/jszip.min-BXqW2-9v.js"])))=>i.map(i=>d[i]);
import{o as e}from"./rolldown-runtime-C0FnF6B9.js";import{at as t,lt as n,n as r,ot as i}from"./dist-B4h6xr7u.js";import{_ as a,i as o,m as s,o as c}from"./fit-DpoYkjM1.js";import{i as l,n as u,r as d,t as f}from"./printLayout-B9g6jJOI.js";import{t as p}from"./messages-Dz_C-IEc.js";import{t as m}from"./preload-helper-kNmmqUCw.js";import{t as h}from"./jszip.min-BXqW2-9v.js";var g=e(h(),1),_={width:794,height:1123},v=new Set([`file:`,`about:`,`data:`]),y=.24,b=3,x=.15,S=`0.3.28`,C=20555,w=`http://schemas.openxmlformats.org/wordprocessingml/2006/main`,T=`http://schemas.openxmlformats.org/officeDocument/2006/relationships`,E=`http://schemas.openxmlformats.org/package/2006/relationships`,D=`urn:schemas-microsoft-com:vml`,O=`word/document.xml`,k=`word/_rels/document.xml.rels`,A=`docx-page-background`,ee={bmp:`image/bmp`,gif:`image/gif`,jpeg:`image/jpeg`,jpg:`image/jpeg`,png:`image/png`,svg:`image/svg+xml`,tif:`image/tiff`,tiff:`image/tiff`,webp:`image/webp`},te=e=>{let t=typeof e.renderAsync==`function`?e:e.default;if(!t||typeof t.renderAsync!=`function`)throw TypeError(`@file-viewer/docx did not expose a compatible renderAsync function.`);return t},j=(()=>{let e={module:null,async load(){return this.module||=m(()=>import(`./docx-preview-C79XdO1T.js`),__vite__mapDeps([0,1,2])),this.module}};return async()=>te(await e.load())})(),M=e=>e instanceof Error&&/(?:undefined|null).*children|children.*(?:undefined|null)/i.test(e.message)&&/renderHeaderFooter/i.test(e.stack||``),N=async(e,t,n,r)=>{try{return await e(t,n,void 0,r),!1}catch(i){if(!M(i))throw i;return n.replaceChildren(),await e(t,n,void 0,{...r,renderHeaders:!1,renderFooters:!1}),!0}},P=(e,t)=>{if((e.byteLength>=4?new DataView(e).getUint16(0,!1):0)!==C)throw Error(p(t?.options)(`word.error.invalidDocx`))},F=e=>e.ownerDocument.defaultView,ne=e=>new((F(e)?.DOMParser)??globalThis.DOMParser),re=e=>{let t=[e.ownerDocument.URL,F(e)?.location?.href,globalThis.location?.href].filter(Boolean);for(let e of t)try{return new URL(e).protocol}catch{}return``},I=(e,t,n)=>{let r=Array.from(e.getElementsByTagNameNS(t,n));return r.length?r:Array.from(e.getElementsByTagName(`*`)).filter(e=>e.localName===n)},L=(e,t)=>{let n=t.parseFromString(e,`application/xml`);return I(n,`http://www.mozilla.org/newlayout/xml/parsererror.xml`,`parsererror`).length?null:n},R=(e,t)=>{let n=t.startsWith(`/`)?[]:e.split(`/`).slice(0,-1);return t.replace(/^\/+/,``).split(`/`).forEach(e=>{if(!(!e||e===`.`)){if(e===`..`){n.pop();return}n.push(e)}}),n.join(`/`)},z=e=>ee[e.split(`.`).pop()?.toLowerCase()||``],B=async(e,t=()=>new DOMParser)=>{try{let n=await g.default.loadAsync(e),r=n.file(O),i=n.file(k);if(!r||!i)return;let a=t(),o=L(await r.async(`string`),a),s=L(await i.async(`string`),a);if(!o||!s)return;let c=I(o,w,`background`)[0],l=c&&I(c,D,`fill`)[0],u=l?.getAttributeNS(T,`id`)||l?.getAttribute(`r:id`);if(!u)return;let d=I(s,E,`Relationship`).find(e=>e.getAttribute(`Id`)===u),f=d?.getAttribute(`Target`);if(!f||d?.getAttribute(`TargetMode`)===`External`)return;let p=R(O,f),m=z(p),h=n.file(p)||n.file(decodeURIComponent(p));return!m||!h?void 0:`data:${m};base64,${await h.async(`base64`)}`}catch{return}},V=(e,t)=>{if(!t)return 0;let n=0;return e.querySelectorAll(`section.docx`).forEach(r=>{let i=Array.from(r.children).find(e=>e.classList.contains(A)),a=i||e.ownerDocument.createElement(`div`);a.className=A,a.setAttribute(`aria-hidden`,`true`),a.style.backgroundImage=`url("${t}")`,i||r.prepend(a),n+=1}),n},H=(e,t)=>t?.worker===!1?!1:t?.worker===!0||!!((F(e)?.Worker??globalThis.Worker)&&t?.workerUrl&&!v.has(re(e))),U=e=>{let t=F(e)?.matchMedia??globalThis.matchMedia;return typeof t==`function`&&t(`(prefers-color-scheme: dark)`).matches},W=(e,t,n)=>{if(n?.darkMode!==void 0)return n.darkMode;let i=r(t?.options?.theme);return i===`dark`||i!==`light`&&U(e)},G=(e,t)=>!e||t?e:/[?&]file-viewer-docx=[^&#]*/.test(e)?e.replace(/([?&])file-viewer-docx=[^&#]*/,`$1file-viewer-docx=${S}`):`${e}${e.includes(`?`)?`&`:`?`}file-viewer-docx=${S}`,K=(e,t)=>{if(t===`allow`)return 0;let n=0;return e.querySelectorAll(`a[href]`).forEach(e=>{let t=e.getAttribute(`href`);!t||t.startsWith(`#`)||(e.hasAttribute(`data-docx-external-href`)||e.setAttribute(`data-docx-external-href`,t),e.removeAttribute(`href`),e.setAttribute(`aria-disabled`,`true`),n+=1)}),n},q=(e,r,a)=>{let o=r?.options?.docx,s=n(e.ownerDocument),c=H(e,o),l=o?.visualPagination===!0,u=W(e,r,o),d=e=>{(e.phase===`render`||e.phase===`layout`||e.phase===`done`)&&a()},f=o?.externalLinkPolicy??`block`,p=o?.externalResourcePolicy??`block`,m={useWorker:c,breakPages:l,ignoreLastRenderedPageBreak:o?.ignoreLastRenderedPageBreak??!l,externalLinkPolicy:f,externalResourcePolicy:p,darkMode:u,progress:t=>{(t.phase===`render`||t.phase===`layout`||t.phase===`done`)&&K(e,f),d(t)}};return c&&(m.workerUrl=G(i(o,s),!!o?.workerUrl),m.workerJsZipUrl=G(t(o,s),!!o?.workerJsZipUrl)),o?.workerTimeout!==void 0&&(m.workerTimeout=o.workerTimeout),o?.renderPageBatchSize===void 0?o?.progressive===!1&&(m.renderPageBatchSize=2**53-1):m.renderPageBatchSize=o.renderPageBatchSize,o?.renderYieldEveryMs!==void 0&&(m.renderYieldEveryMs=o.renderYieldEveryMs),o?.strictWordCompatibility!==void 0&&(m.strictWordCompatibility=o.strictWordCompatibility),o?.paginationTolerance!==void 0&&(m.paginationTolerance=o.paginationTolerance),o?.maxDynamicPaginationPasses!==void 0&&(m.maxDynamicPaginationPasses=o.maxDynamicPaginationPasses),o?.awaitLayout!==void 0&&(m.awaitLayout=o.awaitLayout),o?.preserveComplexFieldResults!==void 0&&(m.preserveComplexFieldResults=o.preserveComplexFieldResults),o?.updatePageReferences!==void 0&&(m.updatePageReferences=o.updatePageReferences),o?.hideWebHiddenContent!==void 0&&(m.hideWebHiddenContent=o.hideWebHiddenContent),m},J=(e,t)=>{let n=F(t)?.HTMLElement;return n?e instanceof n:e instanceof HTMLElement},Y=`
.docx-fit-viewer {
  box-sizing: border-box;
  height: 100%;
  overflow: auto;
  background: var(--file-viewer-render-surface-background, #ececec);
  color-scheme: light;
}
.docx-fit-viewer[data-docx-dark-mode='true'] {
  background: var(--file-viewer-render-surface-background, #242424);
  color-scheme: dark;
}
.docx-fit-viewer .docx-wrapper {
  box-sizing: border-box;
  min-width: 0 !important;
  width: 100% !important;
  padding: 24px 14px 40px !important;
  background: var(--file-viewer-render-surface-background, #e7e9ec) !important;
}
.docx-fit-viewer[data-docx-dark-mode='true'] .docx-wrapper {
  background: var(--file-viewer-render-surface-background, #242424) !important;
}
.docx-fit-viewer .docx-page-frame {
  position: relative;
  width: 100%;
  min-width: 0;
  margin: 0 auto 24px;
  overflow: visible;
}
.docx-fit-viewer .docx-flow-frame {
  position: relative;
  width: 100%;
  min-width: 0;
  margin: 0 auto 28px;
  overflow: visible;
}
.docx-fit-viewer .docx-page-frame > section.docx,
.docx-fit-viewer .docx-flow-frame > section.docx {
  position: absolute;
  top: 0;
  left: 50%;
  margin: 0 !important;
  background: #ffffff !important;
  box-shadow: 0 2px 14px rgba(25, 35, 48, 0.18);
  box-sizing: border-box;
  overflow: hidden;
  transform-origin: top center;
}
.docx-fit-viewer .docx-page-background {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background-position: center;
  background-repeat: no-repeat;
  background-size: 100% 100%;
}
.docx-fit-viewer[data-docx-dark-mode='true'] .docx-page-frame > section.docx,
.docx-fit-viewer[data-docx-dark-mode='true'] .docx-flow-frame > section.docx {
  background: rgb(51, 51, 51) !important;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.8);
  outline: 1px solid rgba(255, 255, 255, 0.15);
  outline-offset: -1px;
}
.docx-fit-viewer .docx-flow-frame > section.docx {
  height: auto !important;
  min-height: var(--docx-page-height, auto) !important;
  overflow: visible !important;
}
.docx-fit-viewer .docx-page-frame > section.docx > article,
.docx-fit-viewer .docx-flow-frame > section.docx > article {
  position: relative;
  z-index: 1;
}
`;function ie(e){let t=e.ownerDocument.createElement(`style`);return t.textContent=Y,e.prepend(t),t}function ae(e,t){let n=e.querySelector(`.docx-wrapper`);return n?Array.from(n.children).flatMap(n=>{if(!J(n,e)||!n.matches(`section.docx`))return[];let r=e.ownerDocument.createElement(`div`);return r.className=t?`docx-page-frame`:`docx-flow-frame`,n.before(r),r.appendChild(n),[r]}):[]}function oe(e,t){e.classList.add(`docx-fit-viewer`);let n=ie(e),r=t?.options?.docx?.visualPagination===!0,i=ae(e,r),u=F(e),d=u?.ResizeObserver,f=0,p=1,m=1,h=1,g=c(),v=e=>Math.min(b,Math.max(y,Number(e.toFixed(2)))),S=()=>{let t=m,n=h,a=!1;i.forEach(i=>{let o=i.firstElementChild;if(!J(o,e))return;o.style.transform=`translateX(-50%)`;let s=o.offsetWidth,c=r?o.offsetHeight:Math.max(o.scrollHeight,o.offsetHeight);if(!s||!c)return;let l=Math.max(e.clientWidth-28,120),u=Math.min(1,Math.max(y,l/s)),d=v(u*p);a||=(t=d,n=u,!0),o.style.transform=`translateX(-50%) scale(${d})`,i.style.width=`${Math.ceil(Math.max(s*d,e.clientWidth-28,120))}px`,i.style.maxWidth=`none`,i.style.height=`${Math.ceil(c*d)}px`}),a&&(m=t,h=n,g.emit())},C=()=>{if(!u){S();return}u.cancelAnimationFrame(f),f=u.requestAnimationFrame(()=>{S()})},w=()=>({scale:m,label:`${Math.round(m*100)}%`,canZoomIn:m<b,canZoomOut:m>y,canReset:p!==1,minScale:y,maxScale:b}),T=e=>(p=Math.min(6,Math.max(.2,Number(e.toFixed(2)))),u?.cancelAnimationFrame(f),S(),w()),E=e=>T(e/Math.max(h,.01)),D=()=>{for(let e of i){let t=X(e);if(!t)continue;let n=l(t,_);return{width:t.offsetWidth||n.width||_.width,height:Z(e)?_.height:t.offsetHeight||n.height||_.height}}return null},O=t=>{let n=D();if(!n)return{applied:!1,mode:t.mode,resize:t.resize,source:t.source,reason:`unmeasurable`,provider:`zoom`};let r=t.mode===`auto`?`width`:t.mode,i=o({mode:r,viewportWidth:Math.max(1,t.viewportWidth||e.clientWidth||0),viewportHeight:Math.max(1,t.viewportHeight||e.clientHeight||0),contentWidth:n.width,contentHeight:n.height,currentScale:m,minScale:t.minScale??y,maxScale:t.maxScale??b});if(!i)return{applied:!1,mode:t.mode,resize:t.resize,source:t.source,reason:`unmeasurable`,provider:`zoom`};let a=E(i);return{applied:!0,mode:t.mode,resize:t.resize,scale:a.scale,source:t.source,provider:`zoom`}};e.dataset.viewerZoomProvider=`docx`,s(e,{zoomIn:()=>T((m+x)/Math.max(h,.01)),zoomOut:()=>T((m-x)/Math.max(h,.01)),resetZoom:()=>T(1),setZoom:E,fit:O,getState:w,subscribe:g.subscribe});let k=d?new d(C):null;return k?.observe(e),i.forEach(e=>{let t=X(e);t&&k?.observe(t)}),S(),()=>{u?.cancelAnimationFrame(f),k?.disconnect(),a(e),n.remove(),e.classList.remove(`docx-fit-viewer`)}}function X(e){let t=e.firstElementChild,n=e.ownerDocument.defaultView?.HTMLElement;return n&&t instanceof n?t:null}function Z(e){return!!e?.classList.contains(`docx-flow-frame`)}function Q(e){let t=e?X(e):null;if(!t)return _;let n=l(t,_);return Z(e)?{width:n.width,height:Math.max(t.scrollHeight||0,t.offsetHeight||0,_.height)}:n}function $(e,t){let n=Z(e),r=d(t.width),i=d(t.height);f(e,t,{heightMode:n?`min`:`fixed`}),e.style.margin=`0 auto 18px`;let a=X(e);a&&(a.style.position=`relative`,a.style.top=`auto`,a.style.left=`auto`,a.style.width=r,a.style.maxWidth=`none`,a.style.minHeight=n?`0`:i,a.style.height=n?`auto`:i,a.style.margin=`0 auto`,a.style.transform=`none`,a.style.transformOrigin=`top left`,a.style.overflow=n?`visible`:`hidden`,a.style.boxShadow=`none`)}function se(e){let t=e.querySelector(`.docx-page-frame, .docx-flow-frame`),n=Q(t||void 0),r=t?.classList.contains(`docx-flow-frame`)?`.viewer-export-content .docx-flow-frame`:`.viewer-export-content .docx-page-frame`;return u({selector:r,width:n.width,height:t?.classList.contains(`docx-flow-frame`)?_.height:n.height,heightMode:t?.classList.contains(`docx-flow-frame`)?`min`:`fixed`})}function ce(e){let t=Array.from(e.querySelectorAll(`.docx-page-frame, .docx-flow-frame`)),n=e.cloneNode(!0),r=e.ownerDocument.createElement(`div`);r.className=`docx-print-document`;let i=Array.from(n.querySelectorAll(`style`)).filter(e=>!e.textContent?.includes(`.docx-fit-viewer`)).map(e=>e.outerHTML).join(``);return n.querySelectorAll(`.docx-page-frame, .docx-flow-frame`).forEach((e,n)=>{e.dataset.viewerPrintPageIndex=String(n),$(e,Q(t[n])),r.appendChild(e.cloneNode(!0))}),r.childElementCount?`${i}${r.outerHTML}`:n.innerHTML}async function le(e,t,n){var r,i;P(e,n),t.replaceChildren();let a=!1,o=()=>{var e;a||(a=!0,(e=n?.onProgressiveRender)==null||e.call(n))},s=q(t,n,o),[{defaultOptions:c,renderAsync:l},u]=await Promise.all([j(),B(e,()=>ne(t))]);t.dataset.docxWorker=s.useWorker?`self`:`false`,t.dataset.docxDarkMode=s.darkMode?`true`:`false`;let d=await N(l,e,t,{...c,...s});K(t,s.externalLinkPolicy),t.dataset.docxHeaderFooterFallback=d?`true`:`false`,t.dataset.docxPageBackground=V(t,u)>0?`true`:`false`,o();let f=oe(t,n);return(r=n?.registerExportAdapter)==null||r.call(n,{includeDocumentStyles:!1,getPrintMaskPages:()=>Array.from(t.querySelectorAll(`.docx-page-frame, .docx-flow-frame`)),beforeSnapshot:()=>{let e=F(t);e&&e.dispatchEvent(new e.Event(`resize`))},printStyle:()=>se(t),toHtml:()=>ce(t)}),(i=n?.registerThumbnailAdapter)==null||i.call(n,{getTarget:()=>t.querySelector(`.docx-page-frame, .docx-flow-frame`)||t}),{$el:t,unmount(){var e,r;(e=n?.registerExportAdapter)==null||e.call(n,null),(r=n?.registerThumbnailAdapter)==null||r.call(n,null),f(),delete t.dataset.docxWorker,delete t.dataset.docxDarkMode,delete t.dataset.docxHeaderFooterFallback,delete t.dataset.docxPageBackground,t.replaceChildren()}}}export{le as default};