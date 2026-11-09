'use strict';
// One place to connect the public site to outside services.
// Leave a value empty and the page shows a clearly labelled local preview instead.
window.siteConfig={
 instagram:'https://www.instagram.com/breakthyrule/',
 // Circle community, e.g. 'https://breakthyrule.circle.so'. In Circle: Settings → Embed → allow this domain.
 // Each space is the path after the community URL, e.g. 'c/forum'. Pages embed `${community}/${space}?iframe=true`.
 circle:{
  community:'',
  spaces:{
   forum:'',            // Community tab: the main forum
   gallery:'',          // Gallery tab: "worn by you" photo space
   archive:'',          // Archive tab: general archive discussion
   topics:{}            // Archive topics by id, e.g. {symbols:'c/symbols', scripture:'c/scripture'}
  }
 },
 librarianApp:'https://librarian-atlas.netlify.app/'
};
