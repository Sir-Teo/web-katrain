import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {evaluate,loadedModuleUrl,navigate,setViewport,waitForExpression} from './browser.mjs';
export async function assertMoveTreeComposition(cdp,appUrl,screenshotDir) {
 const wait=expression=>waitForExpression(cdp,expression,{label:'Move tree composition',diagnose:`({node:window.moveTreeKeyStore?.getState().currentNode.id,moves:window.moveTreeKeyStore?.getState().moveHistory.length,focus:document.activeElement?.getAttribute('aria-label'),scroll:[document.querySelector('[data-tree-key-fixture] [data-move-tree]')?.parentElement.scrollLeft,document.querySelector('[data-tree-key-fixture] [data-move-tree]')?.parentElement.scrollTop],map:!!document.querySelector('[data-tree-key-fixture] [data-move-tree-minimap]')})`});
 const press=async key=>{for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,key,code:key,windowsVirtualKeyCode:{ArrowRight:39,ArrowLeft:37,ArrowDown:40,ArrowUp:38,Home:36,End:35,Enter:13,' ':32}[key],...(type==='keyDown'&&key==='Enter'?{text:'\r'}:{})})};
 const read=()=>evaluate(cdp,`(()=>{const s=moveTreeKeyStore.getState(),tree=document.querySelector('[data-tree-key-fixture] [data-move-tree]');return {node:s.currentNode.id,moves:s.moveHistory.length,scroll:[tree.parentElement.scrollLeft,tree.parentElement.scrollTop]}})()`);
 const ignored=async selector=>{
  await evaluate(cdp,`document.querySelector(${JSON.stringify(selector)}).focus()`);
  await evaluate(cdp,'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  const before=await read();
  for(const init of [{isComposing:true},{keyCode:229},{ctrlKey:true},{altKey:true},{metaKey:true}])for(const key of ['ArrowRight','ArrowLeft','ArrowUp','ArrowDown','Home','End','Enter',' ']) {
   const result=await evaluate(cdp,`(async()=>{const target=document.activeElement,event=new KeyboardEvent('keydown',{bubbles:true,cancelable:true,key:${JSON.stringify(key)},...${JSON.stringify(init)}});target.dispatchEvent(event);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return {prevented:event.defaultPrevented,focused:document.activeElement===target}})()`);
   assert.deepEqual(await read(),before,`${selector}: ${JSON.stringify(init)} ${key} must preserve the game and scroll`);
   assert.equal(result.prevented,false,'Input-method and modified keys must remain available');assert.equal(result.focused,true);
  }
 };
 const reports=[];
 await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 const resources=await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:'performance.setResourceTimingBufferSize(5000)'});
 try {
  for(const width of [1440,390]) {
   const setup=await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`
    localStorage.removeItem('web-katrain:auto_saved_game:v1');localStorage.removeItem('web-katrain:shortcuts:v1');
    localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
    localStorage.setItem('web-katrain:move_tree_minimap:v1','true');localStorage.setItem('web-katrain:move_tree_layout_direction:v1','horizontal');
    localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false}));
   `});
   try{await setViewport(cdp,{width,height:width===390?844:900,mobile:width===390});await navigate(cdp,appUrl,15000,{acceptBeforeUnload:true})}
   finally{await cdp.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:setup.result.identifier})}
   await wait('!!document.querySelector("[data-board-snapshot]")');
   await evaluate(cdp,`(async()=>{
    const url=${loadedModuleUrl.toString()},React=(await import(url('/deps/react.js'))).default,ReactDOM=(await import(url('/deps/react-dom_client.js'))).default;
    window.moveTreeKeyStore=(await import(url('/src/store/gameStore.ts'))).useGameStore;
    const {parseSgf}=await import('/src/utils/sgf.ts'),{MoveTree}=await import(url('/src/components/MoveTree.tsx',true));
    moveTreeKeyStore.getState().loadGame(parseSgf('(;GM[1]SZ[9]'+Array.from({length:120},(_,i)=>';'+(i%2?'W':'B')+'[]').join('')+')'));
    moveTreeKeyStore.getState().jumpToNode(moveTreeKeyStore.getState().rootNode);
    const host=document.createElement('div');host.dataset.treeKeyFixture='true';host.style.cssText='position:fixed;z-index:9999;left:12px;top:100px;width:300px;height:260px;background:white';document.body.append(host);
    const root=ReactDOM.createRoot(host);window.cleanupTreeKeyFixture=()=>{root.unmount();host.remove()};root.render(React.createElement(MoveTree));
   })()`);
   try {
    await wait(`!!document.querySelector('[data-tree-key-fixture] [data-move-tree-node-current=true]')&&!!document.querySelector('[data-tree-key-fixture] [data-move-tree-minimap] svg')`);
    const current='[data-tree-key-fixture] [data-move-tree-node-current=true]';
    await ignored(current);
    await press('ArrowRight');await wait('moveTreeKeyStore.getState().moveHistory.length===1');
    await wait(`document.activeElement===document.querySelector('${current}')`);
    await press('ArrowLeft');await wait('moveTreeKeyStore.getState().moveHistory.length===0');
    await wait(`document.activeElement===document.querySelector('${current}')`);
    await press('End');await wait('moveTreeKeyStore.getState().moveHistory.length===120');
    await wait(`document.activeElement===document.querySelector('${current}')`);
    await press('Home');await wait('moveTreeKeyStore.getState().moveHistory.length===0');
    await wait(`document.activeElement===document.querySelector('${current}')`);
    const map='[data-tree-key-fixture] [data-move-tree-minimap] svg';
    await ignored(map);
    const before=await read();await press('End');await wait(`document.querySelector('[data-tree-key-fixture] [data-move-tree]').parentElement.scrollLeft>${before.scroll[0]}`);
    assert.equal((await read()).node,before.node,'Minimap panning must leave the current game move unchanged');
    await press('Home');await wait(`document.querySelector('[data-tree-key-fixture] [data-move-tree]').parentElement.scrollLeft===0`);
    await press('ArrowRight');await wait(`document.querySelector('[data-tree-key-fixture] [data-move-tree]').parentElement.scrollLeft>0`);
    await press('Enter');await wait(`document.querySelector('[data-tree-key-fixture] [data-move-tree]').parentElement.scrollLeft===0`);
    assert.equal((await read()).node,before.node);
    reports.push({width,nodeAndMinimapIgnoreCompositionAndModifiers:true,ordinaryNodeNavigationAndFocusRetained:true,minimapPanHomeEndAndCenterRetained:true});
   } finally {await evaluate(cdp,'cleanupTreeKeyFixture();delete window.cleanupTreeKeyFixture')}
  }
 } finally {
  await cdp.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:resources.result.identifier});
  await cdp.send('Emulation.setEmulatedMedia',{features:[]});
 }
 fs.writeFileSync(path.join(screenshotDir,'move-tree-composition.json'),JSON.stringify(reports,null,2));
 console.log('Move tree: desktop/phone nodes and minimap retain composition/modifier keys; real arrows/Home/End navigate with focus and pan/center without changing the game move.');
}
