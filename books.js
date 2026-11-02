'use strict';
// Titles, authors, categories, covers and PDF paths from the current site library.
window.showroomBooks=[
 {title:'Codex Magica',author:'Texe Marrs',tag:'Symbols',cover:'codex-magica.webp',file:'Codex Magica Secret Signs, Mysterious Symbols, and Hidden Codes of the Illuminati.pdf',sizeMB:31.4},
 {title:'Symbols of the Illuminati',author:'Unknown',tag:'Symbols',cover:'symbols-illuminati.webp',file:'Symbols Of The Illuminati.pdf',sizeMB:2.3},
 {title:'The Book of Formulas',author:'Wilhelm Quintscher',tag:'Grimoire',cover:'book-of-formulas.webp',file:'the book of formulas wilhelm quintscher.pdf',sizeMB:0.3},
 {title:'The Papacy and the Illuminati',author:'John Litteral',tag:'History',cover:'papacy-illuminati.webp',file:'THE PAPACY AND THE ILLUMINATI.pdf',sizeMB:0.4},
 {title:'Terrorism and the Illuminati',author:'David Livingstone',tag:'History',cover:'terrorism-illuminati.webp',file:'Terrorism and the Illuminati - a three thousand year history - David Livingstone.pdf',sizeMB:1.9},
 {title:'Warfare, Secret Society & Spirit',author:'Various',tag:'Mind Control',cover:'warfare-secret-society.webp',file:'Warfare Secret Society Spirit Mkultra Monarch Mind Control illuminati freemasons Kabbalah.pdf',sizeMB:74.4},
 {title:'The New Money System',author:'Fritz Springmeier',tag:'Finance',cover:'new-money-system.webp',file:'The New Money System Springmeier NWO Illuminati Freemasons.pdf',sizeMB:0.1},
 {title:'The Bible Unveiled',author:'Daniel Vandinja',tag:'Scripture',cover:'bible-unveiled.webp',file:'The BIBLE Unveiled - Daniel Vandinja.pdf',sizeMB:43.1}
].map(book=>({...book,cover:'/library/covers/'+book.cover,url:'https://breakthyrule-co.netlify.app/library/'+encodeURIComponent(book.file)}));
