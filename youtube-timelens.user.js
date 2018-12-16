// ==UserScript==
// @name            YouTube Timelens
// @description     Generates a timelens (see https://timelens.io/) from YouTube's storyboard thumbnails
// @namespace       https://github.com/fkloft
// @include         https://www.youtube.com/*
// @version         0.2
// @grant           none
// @run-at          document-end
// ==/UserScript==

"use strict";

async function getStoryboard(videoId) {
  let result = await fetch("https://www.youtube.com/get_video_info?video_id="+videoId+"&asv=3&el=detailpage&hl=en_US")
  let text = await result.text();
  let videoInfo = new URLSearchParams(text);
  let player_response = videoInfo.get("player_response");
  //let player_response = ytplayer.config.args.player_response;
  
  let details = JSON.parse(player_response)
  
  let length = parseInt(details.videoDetails.lengthSeconds);
  let spec = details.storyboards.playerStoryboardSpecRenderer.spec;
  
  let parts = spec.split("|");
  let baseUrl = parts.shift();
    
  let levels = parts.map((part,i) => {
    let params = part.split("#");
    let width = parseInt(params[0]);
    let height = parseInt(params[1]);
    let count = parseInt(params[2]);
    let cols = parseInt(params[3]);
    let rows = parseInt(params[4]);
    let unknown = params[5];
    let replacement = params[6];
    let sigh = params[7];
    
    if(replacement == "default")
      replacement = "$M";
    
    let url = baseUrl.replace(/\$L/, "" + i).replace(/\$N/, replacement) + "&sigh=" + sigh;
    
    return {
      width,
      height,
      count,
      cols,
      rows,
      unknown,
      sigh,
      url,
    };
  });
  
  return {
    length,
    levels,
  };
}

function getVideoId() {
  	return (new URLSearchParams(location.search)).get("v");
}

function range(n) {
  return [...Array(n).keys()];
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    var img = new Image;
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

async function getTimelens(videoId) {
  let storyboard = await getStoryboard(videoId);
  
  let params = storyboard.levels.pop();
  let sheetCount = Math.ceil(params.count / params.cols / params.rows);
  let sheets = await Promise.all(range(sheetCount).map(i => loadImage(params.url.replace(/\$M/, ""+i))));
  
  let canvas = document.createElement("canvas");
  canvas.dataset.videoId = videoId;
  canvas.width = params.count;
  canvas.height = params.height;
  canvas.style.height = params.height + "px";
  let ctx = canvas.getContext("2d")
  
  let vals = [];
  
  for(let i = 0; i < params.count; i++) {
    let absrow = parseInt(i / params.cols);
    let sheet = parseInt(absrow / params.rows);
    let row = absrow % params.rows;
    let col = i % params.cols;
    
    let image = sheets[sheet];
    let sx = col * params.width;
    let sy = row * params.height;
    ctx.drawImage(image, sx, sy, params.width, params.height, i, 0, 1, params.height);
  }
  
  return canvas;
}

async function insertTimelens() {
  let videoId = getVideoId();
  if(!videoId) return;
  
  let old = document.getElementById("timelens");
  
  if((!old) || old.dataset.videoId != videoId) {
    let bar = document.querySelector(".ytp-progress-bar");
    let canvas = await getTimelens(videoId);
    canvas.id = "timelens";
    
    while(old = document.getElementById("timelens"))
      old.parentNode.removeChild(old);
    
    bar.appendChild(canvas);
  }
}

setInterval(function() {
  insertTimelens().catch(console.error);
}, 2000);

var style = document.head.appendChild(document.createElement("style"));
style.type = "text/css";
style.textContent = `
#timelens {
  position: absolute;
  left: 0;
  bottom: 100%;
  width: 100%;
  opacity: 0;
  transition: opacity 0.5s;
  display: none;
  image-rendering: optimizespeed;
}
.ytp-progress-bar:hover #timelens {
  opacity: 0.8;
  display: block;
}
`;

