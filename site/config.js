'use strict';
// One place to connect the public site to outside services.
window.siteConfig={
 instagram:'https://www.instagram.com/breakthyrule/',
 // CreatingCo's own Circle app. Open its hosted account/session flow; it is not Circle.so.
 circle:{
  community:'https://thecreatingco.com/community/network',
  profile:'https://thecreatingco.com/community/network?view=Profile',
  settings:'https://thecreatingco.com/community/network?view=Settings',
  messages:'https://thecreatingco.com/community/network?view=Messages',
  spaces:{
   forum:'',
   gallery:'',
   archive:'',
   topics:{}            // No dedicated Break Thy Rule spaces have been created yet.
  }
 },
 librarianApp:'https://librarian-atlas.netlify.app/'
};
