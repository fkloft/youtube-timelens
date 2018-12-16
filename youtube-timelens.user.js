// ==UserScript==
// @name            YouTube Timelens
// @description     Generates a timelens (see https://timelens.io/) from YouTube's storyboard thumbnails
// @namespace       https://github.com/fkloft
// @include         https://www.youtube.com/*
// @version         1.1.0
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
	return location.href.match(/^.*(?:(?:youtu\.be\/|v\/|vi\/|u\/\w\/|embed\/)|(?:(?:watch)?\?v(?:i)?=|\&v(?:i)?=))([^#\&\?]*).*/)[1];
	//return (new URLSearchParams(location.search)).get("v");
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

function ProgressBarObserver() {
	let timeLeft = document.querySelector(".ytp-bound-time-left");
	let timeRight = document.querySelector(".ytp-bound-time-right");
	
	if(!(timeLeft && timeRight))
		throw "No video loaded yet";
	
	function getTime(element) {
		let values = element.textContent.split(":");
		
		let seconds = parseInt(values.pop());
		if(values.length)
			seconds += parseInt(values.pop()) * 60;
		if(values.length)
			seconds += parseInt(values.pop()) * 60 * 60;
		if(values.length)
			seconds += parseInt(values.pop()) * 60 * 60 * 24;
		
		return seconds;
	}
	
	function getProgressParams() {
		let length = parseInt(document.querySelector(".ytp-progress-bar").getAttribute("aria-valuemax"));
		let start = getTime(timeLeft);
		let end = getTime(timeRight);
		
		return {length, start, end};
	}
	
	let observer = new MutationObserver(() => {
		let timelens = document.getElementById("timelens");
		if(!timelens) return;

		let {start, end, length} = getProgressParams();
		let offset = start / length;
		let zoom = length / (end-start);
		
		timelens.style.transform = `scaleX(${zoom}) translateX(${-offset*100}%)`;
	});
	
	observer.observe(timeLeft, { characterData: true, childList: true, subtree: true, });
	observer.observe(timeRight, { characterData: true, childList: true, subtree: true, });
	
	this.destroy = function() {
		observer.disconnect();
	}
}

var progressObserver = null;

setInterval(function() {
	insertTimelens().catch(console.error);
	
	if(!progressObserver) {
		try {
			progressObserver = new ProgressBarObserver();
		} catch(e) { }
	}
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
	transform-origin: 0 0;
}
.ytp-progress-bar:hover #timelens,
.ytp-progress-bar-container.ytp-drag #timelens {
	opacity: 0.9;
	display: block;
}
.ytp-tooltip.ytp-preview {
	transform: translateY(-80px);
}
`;

