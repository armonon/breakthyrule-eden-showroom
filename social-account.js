'use strict';
window.createGardenAccountTools=function({api,stopMoving,onDelete}){
 const dialog=document.createElement('dialog');dialog.className='social-account-dialog';dialog.id='social-account-dialog';dialog.setAttribute('aria-labelledby','account-tools-title');document.body.append(dialog);
 let done=null;
 function shell(title){dialog.replaceChildren();const header=document.createElement('header'),heading=document.createElement('h2');heading.id='account-tools-title';heading.textContent=title;header.append(heading);dialog.append(header);stopMoving();}
 function icon(name,label,action){const button=document.createElement('button');button.type='button';button.className='icon-button';button.title=label;button.setAttribute('aria-label',label);const i=document.createElement('i');i.dataset.lucide=name;button.append(i);button.onclick=action;return button;}
 dialog.addEventListener('close',()=>{const resolve=done;done=null;dialog.replaceChildren();resolve?.();});
 return {
  showCode(name,code){
   shell('Account recovery code');
   const body=document.createElement('div');body.className='account-tools-body';
   const text=document.createElement('p');text.textContent='Keep this code private. It can reset your password and is shown only once. A new code replaces any previous code.';
   const field=document.createElement('input');field.readOnly=true;field.value=code;field.setAttribute('aria-label','Account recovery code');
   const status=document.createElement('p');status.setAttribute('role','status');
   const controls=document.createElement('div');controls.className='account-tools-actions';
   controls.append(icon('copy','Copy recovery code',async()=>{try{await navigator.clipboard.writeText(code);status.textContent='Copied.';}catch{field.select();status.textContent='Select and copy the code.';}}));
   controls.append(icon('download','Download recovery code',()=>{const url=URL.createObjectURL(new Blob([`EDEN account: ${name}\nRecovery code: ${code}\nKeep this file private.\n`],{type:'text/plain'}));const a=document.createElement('a');a.href=url;a.download='eden-recovery-'+name+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}));
   const close=document.createElement('button');close.type='button';close.textContent='Continue';close.onclick=()=>dialog.close();controls.append(close);
   body.append(text,field,controls,status);dialog.append(body);dialog.showModal();window.lucide?.createIcons();return new Promise(resolve=>{done=resolve;});
  },
  remove(){
   shell('Delete account');const form=document.createElement('form');form.className='account-tools-body';
   const text=document.createElement('p');text.textContent='Permanently delete your account, saved character, and garden chat messages? This cannot be undone.';
   const label=document.createElement('label');label.textContent='Current password';const input=document.createElement('input');input.type='password';input.autocomplete='current-password';input.required=true;input.maxLength=128;label.append(input);
   const status=document.createElement('p');status.setAttribute('role','alert');
   const controls=document.createElement('div');controls.className='account-tools-actions';const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel';cancel.onclick=()=>dialog.close();const submit=document.createElement('button');submit.type='submit';submit.textContent='Delete account';controls.append(cancel,submit);
   form.append(text,label,status,controls);dialog.append(form);form.onsubmit=async event=>{event.preventDefault();submit.disabled=true;status.textContent='';try{await api('delete',{password:input.value});input.value='';dialog.close();onDelete();}catch(error){status.textContent=error.message;}finally{submit.disabled=false;}};dialog.showModal();input.focus();
  }
 };
};
