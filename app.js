import * as THREE from "./vendor/three.module.js";
import {OrbitControls} from "./vendor/OrbitControls.js";
const blob = document.getElementById("blob");

if (blob) {
    window.onpointermove = event => {
        const { clientX, clientY } = event;

        blob.animate({
            left: `${clientX}px`,
            top: `${clientY}px`
        }, { duration: 5000, fill: "forwards" });
    };
}
const containerEl = document.querySelector(".globe-wrapper");
const canvas3D = containerEl.querySelector("#globe-3d");
const canvas2D = containerEl.querySelector("#globe-2d-overlay");
const popupEl = containerEl.querySelector(".globe-popup");

let renderer, scene, camera, rayCaster, controls, group;
let overlayCtx = canvas2D.getContext("2d");
let coordinates2D = [0, 0];
let pointerPos;
let clock, mouse, pointer, globe, globeMesh;
let popupVisible = false;
let earthTexture, mapMaterial;
let popupOpenTl, popupCloseTl;

let dragged = false;
let hasSelection = false;
const statusEl = document.getElementById("globe-status");
const themeSelect = document.getElementById("theme-select");
const themes = {
    green: {mesh: 0x00fff8, opacity: .04, pointer: 0x00ffaa, connector: "#ffb700"},
    autheo: {mesh: 0x00fff8, opacity: .04, pointer: 0x00ffaa, connector: "#ffb700"},
    white: {mesh: 0x222222, opacity: .05, pointer: 0x000000, connector: "#000000"}
};
let savedTheme;
try { savedTheme = localStorage.getItem("globe-theme"); } catch { /* Storage may be disabled. */ }
let currentTheme = new URLSearchParams(location.search).get("theme") || savedTheme || "green";
if (!Object.hasOwn(themes, currentTheme)) currentTheme = "green";
applyTheme(currentTheme);
themeSelect.addEventListener("change", () => {
    applyTheme(themeSelect.value);
    const url = new URL(location.href);
    url.searchParams.set("theme", currentTheme);
    history.replaceState(null, "", url);
});

function applyTheme(name) {
    if (!Object.hasOwn(themes, name)) return;
    currentTheme = name;
    document.documentElement.dataset.theme = name;
    themeSelect.value = name;
    try { localStorage.setItem("globe-theme", name); } catch { /* Keep in-memory switching usable. */ }
    const theme = themes[name];
    if (globeMesh) {
        globeMesh.material.color.setHex(theme.mesh);
        globeMesh.material.opacity = theme.opacity;
        pointer.material.color.setHex(theme.pointer);
    }
}

function showLoadError(message) {
    statusEl.textContent = message;
    statusEl.hidden = false;
    containerEl.dataset.state = "error";
}

try {
    initScene();
} catch (error) {
    showLoadError("The globe could not start. Check that WebGL is enabled, then reload.");
    console.error(error);
}
window.addEventListener("resize", updateSize);


function initScene() {
    renderer = new THREE.WebGLRenderer({canvas: canvas3D, alpha: true});
	renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(-1.1, 1.1, 1.1, -1.1, 0, 3);
    camera.position.z = 1.1;

    rayCaster = new THREE.Raycaster();
    rayCaster.far = 1.15;
    mouse = new THREE.Vector2(-1, -1);
    clock = new THREE.Clock();

    createOrbitControls();

    popupVisible = false;

    new THREE.TextureLoader().load(
        //"https://raw.githubusercontent.com/fruitbox12/workflowFunction/main/as.jpg",
		 "./assets/earth-map-colored.png",
        (mapTex) => {
            earthTexture = mapTex;
            earthTexture.repeat.set(1, 1);
            createGlobe();
            createPointer();
            createPopupTimelines();
            addCanvasEvents();
            updateSize();
            applyTheme(currentTheme);
            render();
            statusEl.hidden = true;
            containerEl.dataset.state = "ready";
        }, undefined, () => {
            showLoadError("The map image could not load. Check your connection, then reload.");
        });
}


function createOrbitControls() {
    controls = new OrbitControls(camera, canvas3D);
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.enableDamping = true;
    controls.minPolarAngle = .4 * Math.PI;
    controls.maxPolarAngle = .4 * Math.PI;
    controls.autoRotate = true;

    let dragStart;
    canvas3D.addEventListener("pointerdown", (event) => {
        dragged = false;
        dragStart = {x: event.clientX, y: event.clientY};
    });
    canvas3D.addEventListener("pointermove", (event) => {
        if (dragStart && Math.hypot(event.clientX - dragStart.x, event.clientY - dragStart.y) > 5) dragged = true;
    });
    canvas3D.addEventListener("pointerup", () => { dragStart = null; });
    canvas3D.addEventListener("pointercancel", () => { dragStart = null; dragged = true; });
}

function createGlobe() {
    const globeGeometry = new THREE.IcosahedronGeometry(1, 22);
    mapMaterial = new THREE.ShaderMaterial({
        vertexShader: document.getElementById("vertex-shader-map").textContent,
        fragmentShader: document.getElementById("fragment-shader-map").textContent,
        uniforms: {
            u_map_tex: {type: "t", value: earthTexture},
            u_dot_size: {type: "f", value: 0},
            u_pointer: {type: "v3", value: new THREE.Vector3(.0, .0, 1.)},
            u_time_since_click: {value: 0},
        },
        alphaTest: false,
        transparent: true
    });

    globe = new THREE.Points(globeGeometry, mapMaterial);
    scene.add(globe);

    globeMesh = new THREE.Mesh(globeGeometry, new THREE.MeshBasicMaterial({
        color: 0x00fff8,
        transparent: true,
        opacity: .04
    }));
    scene.add(globeMesh);
}

function createPointer() {
    const geometry = new THREE.SphereGeometry(.04, 16, 16);
    const material = new THREE.MeshBasicMaterial({
        color: 0x00ffaa,
        transparent: true,
        opacity: 0.5
    });
    pointer = new THREE.Mesh(geometry, material);
    pointer.visible = false;
    scene.add(pointer);
}


function updateOverlayGraphic() {
    let activePointPosition = pointer.position.clone();
    activePointPosition.applyMatrix4(globe.matrixWorld);
    const activePointPositionProjected = activePointPosition.clone();
    activePointPositionProjected.project(camera);
    coordinates2D[0] = (activePointPositionProjected.x + 1) * containerEl.offsetWidth * .5;
    coordinates2D[1] = (1 - activePointPositionProjected.y) * containerEl.offsetHeight * .5;

    const matrixWorldInverse = controls.object.matrixWorldInverse;
    activePointPosition.applyMatrix4(matrixWorldInverse);

    if (activePointPosition.z > -1) {
        if (popupVisible === false) {
            popupVisible = true;
            showPopupAnimation(false);
        }

        let popupX = coordinates2D[0];
        popupX -= (activePointPositionProjected.x * containerEl.offsetWidth * .3);

        let popupY = coordinates2D[1];
        const upDown = (activePointPositionProjected.y > .6);
        popupY += (upDown ? 20 : -20);

        gsap.set(popupEl, {
            x: popupX,
            y: popupY,
            xPercent: -35,
            yPercent: upDown ? 0 : -100
        });

        popupY += (upDown ? -5 : 5);
        const curveMidX = popupX + activePointPositionProjected.x * 100;
        const curveMidY = popupY + (upDown ? -.5 : .1) * coordinates2D[1];

        drawPopupConnector(coordinates2D[0], coordinates2D[1], curveMidX, curveMidY, popupX, popupY);

    } else {
        if (popupVisible) {
            popupOpenTl.pause(0);
            popupCloseTl.play(0);
        }
        popupVisible = false;
    }
}

function addCanvasEvents() {
    containerEl.addEventListener("mousemove", (e) => {
        updateMousePosition(e.clientX, e.clientY);
    });

    containerEl.addEventListener("click", (e) => {
        if (!dragged) {
            updateMousePosition(
                e.targetTouches ? e.targetTouches[0].pageX : e.clientX,
                e.targetTouches ? e.targetTouches[0].pageY : e.clientY,
            );

            const res = checkIntersects();
            if (res.length) {
                hasSelection = true;
                pointer.visible = true;
                pointerPos = res[0].point.clone().normalize();
                pointer.position.copy(pointerPos);
                mapMaterial.uniforms.u_pointer.value.copy(pointerPos);
                popupEl.innerHTML = cartesianToLatLong();
                showPopupAnimation(true);
                clock.start()
            }
        }
    });

    function updateMousePosition(eX, eY) {
        const rect = canvas3D.getBoundingClientRect();
        mouse.x = (eX - rect.left) / rect.width * 2 - 1;
        mouse.y = -((eY - rect.top) / rect.height) * 2 + 1;
    }
}

function checkIntersects() {
    rayCaster.setFromCamera(mouse, camera);
    const intersects = rayCaster.intersectObject(globeMesh);
    if (intersects.length) {
        canvas3D.style.cursor = "pointer";
    } else {
        canvas3D.style.cursor = "auto";
    }
    return intersects;
}

function render() {
    mapMaterial.uniforms.u_time_since_click.value = clock.getElapsedTime();
    checkIntersects();
    if (hasSelection) {
        updateOverlayGraphic();
    }
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(render);
}

function updateSize() {
    if (!renderer) return;
    const minSide = .65 * Math.min(window.innerWidth, window.innerHeight);
    containerEl.style.width = minSide + "px";
    containerEl.style.height = minSide + "px";
    renderer.setSize(minSide, minSide);
    canvas2D.width = canvas2D.height = minSide;
    if (mapMaterial) mapMaterial.uniforms.u_dot_size.value = .04 * minSide * renderer.getPixelRatio() / 2;
}


//  ---------------------------------------
//  HELPERS

// popup content
function cartesianToLatLong() {
    const pos = pointer.position;
    const lat = 90 - Math.acos(pos.y) * 180 / Math.PI;
    const lng = (270 + Math.atan2(pos.x, pos.z) * 180 / Math.PI) % 360 - 180;
    return formatCoordinate(lat, 'N', 'S') + ",&nbsp;" + formatCoordinate(lng, 'E', 'W');
}

function formatCoordinate(coordinate, positiveDirection, negativeDirection) {
    const direction = coordinate >= 0 ? positiveDirection : negativeDirection;
    return `${Math.abs(coordinate).toFixed(4)}°&nbsp${direction}`;
}


// popup show / hide logic
function createPopupTimelines() {
    popupOpenTl = gsap.timeline({
        paused: true
    })
        .to(pointer.material, {
            duration: .2,
            opacity: 1,
        }, 0)
        .fromTo(canvas2D, {
            opacity: 0
        }, {
            duration: .3,
            opacity: 1
        }, .15)
        .fromTo(popupEl, {
            opacity: 0,
            scale: .9,
            transformOrigin: "center bottom"
        }, {
            duration: .1,
            opacity: 1,
            scale: 1,
        }, .15 + .1);

    popupCloseTl = gsap.timeline({
        paused: true
    })
        .to(pointer.material, {
            duration: .3,
            opacity: .2,
        }, 0)
        .to(canvas2D, {
            duration: .3,
            opacity: 0
        }, 0)
        .to(popupEl, {
            duration: 0.3,
            opacity: 0,
            scale: 0.9,
            transformOrigin: "center bottom"
        }, 0);
}

function showPopupAnimation(lifted) {
    if (lifted) {
        let positionLifted = pointer.position.clone();
        positionLifted.multiplyScalar(1.3);
        gsap.from(pointer.position, {
            duration: .25,
            x: positionLifted.x,
            y: positionLifted.y,
            z: positionLifted.z,
            ease: "power3.out"
        });
    }
    popupCloseTl.pause(0);
    popupOpenTl.play(0);
}


// overlay (line between pointer and popup)
function drawPopupConnector(startX, startY, midX, midY, endX, endY) {
    overlayCtx.strokeStyle = themes[currentTheme].connector;
    overlayCtx.lineWidth = 3;
    overlayCtx.lineCap = "round";
    overlayCtx.clearRect(0, 0, containerEl.offsetWidth, containerEl.offsetHeight);
    overlayCtx.beginPath();
    overlayCtx.moveTo(startX, startY);
    overlayCtx.quadraticCurveTo(midX, midY, endX, endY);
    overlayCtx.stroke();
}


// Placeholder for fetching Polkadot validator node data
async function fetchValidatorNodes() {
    // Implement fetching logic here
    // This should return an array of objects with latitude and longitude properties
	connectWebSocket();

    return [{latitude: -34.603722, longitude: -58.381592}]; // Example data
}
function latLongToVector3(latitude, longitude, radius = 1) {
    const phi = (90 - latitude) * (Math.PI / 180);
    const theta = (longitude + 180) * (Math.PI / 180);

    const x = -(radius * Math.sin(phi) * Math.cos(theta));
    const z = radius * Math.sin(phi) * Math.sin(theta);
    const y = radius * Math.cos(phi);

    return new THREE.Vector3(x, y, z);
}

let websocket = null;
const telemetryURL = 'wss://feed.telemetry.polkadot.io/feed';

function connectWebSocket() {
    websocket = new WebSocket(telemetryURL);

    websocket.onopen = function() {
        console.log('WebSocket connected');
        // You can subscribe or send messages to the server if required by the protocol
    };
	
websocket.onmessage = async (event) => {
    if (event.data instanceof Blob) {
        const text = await event.data.text();
        try {
            const data = JSON.parse(text);
			     const messages = new Array(data.length / 2);
			  
			   for (let i = 0; i < messages.length; i++) {
        const item = messages[i];
        // Check if the item is an array with the expected structure
        if (Array.isArray(item) && item.length === 8 && item[6] && item[6].length === 3) {
            const [latitude, longitude, locationName] = item[6];
           
                // Found the Helsinki coordinates, now update the globe popup
                updateGlobePopup(latitude, longitude, locationName);
                break; // Stop searching after finding Helsinki
           
        }
    }
 if (data.type === 'validatorNodes') {
      console.log("Validator Nodes:", data.nodes);
      
      // If you need to process the list of validator nodes further, do it here
      data.nodes.forEach(node => {
        console.log(`Validator Node: ${node.id}, Status: ${node.status}`);
      });
    }
    websocket.send(`subscribe:0x05d5279c52c484cc80396535a316add7d47b1c5b9e0398dd1f584149341460c5`) 
	websocket.send(`send-finality:0x05d5279c52c484cc80396535a316add7d47b1c5b9e0398dd1f584149341460c5`)
			  console.log(data);
			          const { latitude, longitude } = parseWebSocketData(data);
 if (latitude && longitude) {
            updateGlobePopup(latitude, longitude);
        }
			  for (const index of messages.keys()) {
      const [ action, payload] = data.slice(index * 2);

      messages[index] = { action, payload };
    } 
            // Handle your JSON data here
        } catch (error) {
            console.error("Error parsing JSON from Blob:", error);
        }
    } else {
        try {
            const data = JSON.parse(event.data);
            // Handle your JSON data here
        } catch (error) {
            console.error("Error parsing JSON:", error);
        }
    }
};

    websocket.onclose = function() {
        console.log('WebSocket disconnected. Reconnecting...');
        setTimeout(connectWebSocket, 1000); // Reconnect
    };

    websocket.onerror = function(error) {
        console.error('WebSocket Error: ', error);
    };
}

// The original telemetry experiment is opt-in; basic display must not depend on it.
if (new URLSearchParams(location.search).get("telemetry") === "1") fetchValidatorNodes();
const parse = (val) => {
  try {
	  	  console.log(JSON.parse(val.data))
const messages = new Array(data.length / 2);
    let locationData = null; // To store longitude and latitude if present

    for (const index of messages.keys()) {
      const [ action, payload] = data.slice(index * 2);
   // Check if payload contains longitude and latitude
      if (payload && payload.longitude && payload.latitude) {
        locationData = { longitude: payload.longitude, latitude: payload.latitude };
      }
      messages[index] = { action, payload };
    }     return locationData || messages;


  } catch (error) {
    console.error("Error parsing JSON:", error);
    return null; // or undefined, or however you want to handle parse errors
  }
};
function deserialize(data){
  const json = parse(data);

  if (!Array.isArray(json) || json.length === 0 || json.length % 2 !== 0) {
    throw new Error('Invalid FeedMessage.Data');
  }

  const messages = new Array(json.length / 2);

  for (const index of messages.keys()) {
    const [action, payload] = json.slice(index * 2);

    messages[index] = { action, payload };
  }

  return messages;
}
function updateGlobePopup(latitude, longitude) {
    // Convert latitude and longitude to spherical coordinates
    const radius = 2; // Assuming your globe's radius is 2
    const phi = (90 - latitude) * Math.PI / 180;
    const theta = (longitude + 180) * Math.PI / 180;

    const x = -(radius * Math.sin(phi) * Math.cos(theta));
    const y = radius * Math.cos(phi);
    const z = radius * Math.sin(phi) * Math.sin(theta);

    // Check if the pointer (marker) already exists, if not, create it
    if (!pointer) {
        const geometry = new THREE.SphereGeometry(0.05, 32, 32); // Small sphere geometry for the marker
        const material = new THREE.MeshBasicMaterial({ color: 0xff0000 }); // Red color marker
        pointer = new THREE.Mesh(geometry, material);
        scene.add(pointer);
    }

    // Update pointer position
    pointer.position.set(x, y, z);

    // Update popup content and position
    const popupContent = `Latitude: ${latitude.toFixed(2)}, Longitude: ${longitude.toFixed(2)}`;
    popupEl.innerHTML = popupContent;

    // Convert 3D position to 2D screen position
    const vector = new THREE.Vector3(x, y, z);
    vector.project(camera);

    const x2D = (vector.x *  .5 + .5) * containerEl.clientWidth;
    const y2D = (-(vector.y * .5) + .5) * containerEl.clientHeight;

    // Update popup element position
    popupEl.style.transform = `translate(-50%, -100%) translate(${x2D}px, ${y2D}px)`;
    popupEl.style.display = 'block';

    // Ensure the popup is visible and adjust its positioning as necessary
    if (!popupVisible) {
        popupEl.style.opacity = 1;
        popupVisible = true;
    }
}
function parseWebSocketData(data) {
    // Initialize an empty array to hold the extracted location data
    let locations = [];

    // Iterate through the main array
    for (let i = 0; i < data.length; i++) {
        // Check for the structure that contains the location information
        // Assuming this structure is an array with 3 elements: [latitude, longitude, "Location Name"]
        if (Array.isArray(data[i]) && data[i].length === 3 && typeof data[i][0] === "number" && typeof data[i][1] === "number" && typeof data[i][2] === "string") {
            // Extract the latitude, longitude, and location name
            const [latitude, longitude, locationName] = data[i];

            // Add the extracted information to the locations array
            locations.push({ latitude, longitude, locationName });
        }
    }

    // Return the array of locations
    return locations;
}
document.addEventListener('DOMContentLoaded', () => {
    const menuItems = document.querySelectorAll('.menu li');
    
    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            menuItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            
            const icon = item.querySelector('i');
            icon.style.transform = 'scale(1.2)';
            setTimeout(() => {
                icon.style.transform = 'scale(1)';
            }, 200);
        });
    });
    
    menuItems.forEach(item => {
        item.addEventListener('mouseenter', (e) => {
            const highlight = document.createElement('div');
            highlight.classList.add('highlight');
            highlight.style.position = 'absolute';
            highlight.style.top = '0';
            highlight.style.left = '0';
            highlight.style.width = '100%';
            highlight.style.height = '100%';
            highlight.style.borderRadius = '16px';
            highlight.style.background = 'radial-gradient(circle at ' + (e.offsetX) + 'px ' + (e.offsetY) + 'px, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0) 70%)';
            highlight.style.pointerEvents = 'none';
            
            item.appendChild(highlight);
            
            setTimeout(() => {
                highlight.style.opacity = '0';
                setTimeout(() => {
                    item.removeChild(highlight);
                }, 300);
            }, 500);
        });
    });
    
    const cards = document.querySelectorAll('.card');
    cards.forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const rotateY = (x / rect.width - 0.5) * 10;
            const rotateX = (y / rect.height - 0.5) * -10;
            
            card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.05)`;
        });
        
        card.addEventListener('mouseleave', () => {
            card.style.transform = 'translateY(0) scale(1)';
            card.style.transition = 'transform 0.5s ease';
        });
    });
}); 
