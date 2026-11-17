(()=>{
 const button=document.getElementById('forum-theme-toggle');
 function render(){const night=document.documentElement.dataset.forumTheme==='night';button.setAttribute('aria-pressed',String(night));button.textContent=night?'Day mode':'Night mode';}
 button.addEventListener('click',()=>{const next=document.documentElement.dataset.forumTheme==='night'?'day':'night';document.documentElement.dataset.forumTheme=next;try{localStorage.setItem('btr-forum-theme',next);}catch{}render();});
 render();
})();
