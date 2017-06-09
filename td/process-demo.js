/**
 * @Author: Zhengfeng.Yao <yzf>
 * @Date:   2017-06-08 14:38:58
 * @Last modified by:   yzf
 * @Last modified time: 2017-06-08 14:38:59
 */

const fs = require('fs');
const path = require('path');
const JsonML = require('jsonml.js/lib/utils');
const Prism = require('node-prismjs');
const nunjucks = require('nunjucks');
nunjucks.configure({ autoescape: false });

const transformer = require('../react/transformer');

const tmpl = fs.readFileSync(path.join(__dirname, 'template.html')).toString();
const watchLoader = path.join(__dirname, './loader/watch');

function isStyleTag(node) {
 return node && JsonML.getTagName(node) === 'style';
}

function getCode(node) {
 return JsonML.getChildren(
   JsonML.getChildren(node)[0]
 )[0];
}

function getChineseIntroStart(contentChildren) {
 return contentChildren.findIndex(node =>
    JsonML.getTagName(node) === 'h2' &&
     JsonML.getChildren(node)[0] === 'zh-CN'
 );
}

function getEnglishIntroStart(contentChildren) {
 return contentChildren.findIndex(node =>
    JsonML.getTagName(node) === 'h2' &&
     JsonML.getChildren(node)[0] === 'en-US'
 );
}

function getCodeIndex(contentChildren) {
 return contentChildren.findIndex(node =>
    JsonML.getTagName(node) === 'pre' &&
     JsonML.getAttributes(node).lang === 'jsx'
 );
}

function getCorrespondingTSX(filename) {
 return path.join(process.cwd(), filename.replace(/\.md$/i, '.tsx'));
}

function getSourceCodeObject(contentChildren, codeIndex) {
 if (codeIndex > -1) {
   return {
     isES6: true,
     code: getCode(contentChildren[codeIndex]),
   };
 }

 return {
   isTS: true,
 };
}

function getStyleNode(contentChildren) {
 return contentChildren.filter(node =>
    isStyleTag(node) ||
     (JsonML.getTagName(node) === 'pre' && JsonML.getAttributes(node).lang === 'css')
 )[0];
}

module.exports = (markdownData, isBuild, noPreview, babelConfig) => {
 const meta = markdownData.meta;
 meta.id = meta.filename.replace(/\.md$/, '').replace(/\//g, '-');
 // Should throw debugging demo while publish.
 if (isBuild && meta.debug) {
   return { meta: {} };
 }

 // Update content of demo.
 const contentChildren = JsonML.getChildren(markdownData.content);
 const chineseIntroStart = getChineseIntroStart(contentChildren);
 const englishIntroStart = getEnglishIntroStart(contentChildren);
 const codeIndex = getCodeIndex(contentChildren);
 const introEnd = codeIndex === -1 ? contentChildren.length : codeIndex;
 if (chineseIntroStart > -1 /* equal to englishIntroStart > -1 */) {
   markdownData.content = {
     'zh-CN': contentChildren.slice(chineseIntroStart + 1, englishIntroStart),
     'en-US': contentChildren.slice(englishIntroStart + 1, introEnd),
   };
 } else {
   markdownData.content = contentChildren.slice(0, introEnd);
 }

 const sourceCodeObject = getSourceCodeObject(contentChildren, codeIndex);
 if (sourceCodeObject.isES6) {
   markdownData.highlightedCode = contentChildren[codeIndex].slice(0, 2);
   if (!noPreview) {
     markdownData.preview = {
       __BISHENG_EMBEDED_CODE: true,
       code: transformer(sourceCodeObject.code, babelConfig),
     };
   }
 } else {
   // TODO: use loader's `this.dependencies` to watch
   const requireString = `require('!!babel!${watchLoader}!${getCorrespondingTSX(meta.filename)}')`;
   markdownData.highlightedCode = {
     __BISHENG_EMBEDED_CODE: true,
     code: `${requireString}.highlightedCode`,
   };
   markdownData.preview = {
     __BISHENG_EMBEDED_CODE: true,
     code: `${requireString}.preview`,
   };
 }

 // Add style node to markdown data.
 const styleNode = getStyleNode(contentChildren);
 if (isStyleTag(styleNode)) {
   markdownData.style = JsonML.getChildren(styleNode)[0];
 } else if (styleNode) {
   const styleTag = contentChildren.filter(isStyleTag)[0];
   markdownData.style = getCode(styleNode) + (styleTag ? JsonML.getChildren(styleTag)[0] : '');
   markdownData.highlightedStyle = JsonML.getAttributes(styleNode).highlighted;
 }

 if (meta.iframe) {
   const html = nunjucks.renderString(tmpl, {
     id: meta.id,
     style: markdownData.style,
     script: markdownData.preview.code,
     reactRouter: meta.reactRouter === 'react-router' ? 'react-router@3/umd/ReactRouter' :
       (meta.reactRouter === 'react-router-dom' ? 'react-router-dom@4/umd/react-router-dom' : false),
   });
   const fileName = `demo-${Math.random()}.html`;
   fs.writeFile(path.join(process.cwd(), '_site', fileName), html);
   markdownData.src = path.join('/', fileName);
 }

 return markdownData;
};