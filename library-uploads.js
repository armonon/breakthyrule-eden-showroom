'use strict';
window.createLibraryUploads=function({onBooksChanged,onOpen,onClose}){
 const $=id=>document.getElementById(id),dialog=$('upload-dialog'),input=$('pdf-files'),status=$('upload-status');
 let busy=false;
 const shared=window.communityLibrary;
 async function load(){
  await shared.refresh();status.textContent=shared.isConnected()?'PDF only / up to 4 MB each':'Upload service unavailable. Please try again.';return shared.isConnected();
 }
 const ready=load();
 function open(){onOpen();if(!busy){$('upload-results').replaceChildren();load();}if(!dialog.open)dialog.showModal();}
 $('add-shelf-pdf').onclick=$('add-library-pdf').onclick=open;
 $('close-upload').onclick=()=>dialog.close();
 dialog.addEventListener('close',onClose);
 $('choose-pdfs').onclick=()=>input.click();
 function upload(file,onProgress){
  return new Promise((resolve,reject)=>{
   const xhr=new XMLHttpRequest();xhr.open('POST',shared.endpoint+'?action=upload&rights=1&name='+encodeURIComponent(file.name));xhr.setRequestHeader('Content-Type','application/pdf');xhr.timeout=120000;
   xhr.upload.onprogress=e=>{if(e.lengthComputable)onProgress(Math.round(e.loaded/e.total*100));};
   xhr.onload=()=>{try{const data=JSON.parse(xhr.responseText);if(xhr.status>=200&&xhr.status<300)resolve(data);else reject(new Error(data.error||'Upload failed. Try again.'));}catch(error){reject(new Error('Upload service unavailable. Try again.'));}};
   xhr.onerror=()=>reject(new Error('Connection lost. Try again.'));xhr.ontimeout=()=>reject(new Error('Upload timed out. Try again.'));xhr.send(file);
  });
 }
 async function add(files){
  if(busy||!files.length)return;
  if(!$('pdf-rights').checked){status.textContent='Confirm you have permission to share these PDFs publicly.';input.value='';return;}
  if(files.length>20){status.textContent='Choose up to 20 PDFs at a time.';return;}
  busy=true;$('choose-pdfs').disabled=true;dialog.setAttribute('aria-busy','true');
  let added=0,failed=0;$('upload-results').replaceChildren();
  for(const [position,file] of files.entries()){
   const row=document.createElement('li'),name=document.createElement('strong'),message=document.createElement('span');name.textContent=file.name;row.append(name,message);$('upload-results').append(row);
   try{
    if(!/\.pdf$/i.test(file.name))throw new Error('Choose a PDF file.');
    if(!file.size||file.size>4*1024*1024)throw new Error('PDF must be between 1 byte and 4 MB.');
    message.textContent='Uploading...';status.textContent='Uploading '+(position+1)+' of '+files.length;
    const result=await upload(file,percent=>{message.textContent=percent===100?'Checking PDF...':'Uploading '+percent+'%';});
    shared.apply(result);const last=window.showroomBooks.findIndex(book=>book.url===result.book.url);if(!result.duplicate)added++;
    message.textContent=result.duplicate?'Already on the shelf':'Added to the shelf';row.className='upload-success';onBooksChanged(last);
   }catch(error){failed++;message.textContent=error.message;row.className='upload-error';}
  }
  busy=false;$('choose-pdfs').disabled=false;dialog.setAttribute('aria-busy','false');input.value='';
  status.textContent=added+' added'+(failed?' / '+failed+' could not be added':'')+'.';
 }
 input.onchange=()=>add([...input.files]);
 const drop=$('pdf-drop');
 drop.addEventListener('dragover',event=>{event.preventDefault();drop.classList.add('dragging');});
 drop.addEventListener('dragleave',()=>drop.classList.remove('dragging'));
 drop.addEventListener('drop',event=>{event.preventDefault();drop.classList.remove('dragging');add([...event.dataTransfer.files]);});
 return {ready,open};
};
