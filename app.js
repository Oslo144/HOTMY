import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getFirestore, collection, onSnapshot, addDoc, getDocs, deleteDoc, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyChJZGxSVTh6uryXwB29GeMqk11tllJ19g",
  authDomain: "mapa-android-2026.firebaseapp.com",
  databaseURL: "https://mapa-android-2026-default-rtdb.firebaseio.com",
  projectId: "mapa-android-2026",
  storageBucket: "mapa-android-2026.firebasestorage.app",
  messagingSenderId: "319986015550",
  appId: "1:319986015550:web:c380ceb550851beb1ee06f",
  measurementId: "G-DR1JBW5GED"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

mapboxgl.accessToken = 'pk.eyJ1Ijoib2xkc2FrZSIsImEiOiJjbW0xZmwxaW0wOWc3Mm9xMnFjOWZsa3R5In0.0aVBPEccjfz0lLLpez-dhw';

const map = new mapboxgl.Map({
    container: "map",
    style: "mapbox://styles/mapbox/streets-v12",
    center: [-68.1193, -16.5],
    zoom: 14
});

let modo = "normal";
let puntos = [];
let markersPuntos = [];
let seleccionId = null;
let nombreActual = null;

const cache = {};
const dispositivos = {};
const markers = {};

// Toast
function showToast(mensaje, duracion = 2500) {
    const toast = document.getElementById("toast");
    toast.textContent = mensaje;
    toast.style.display = "block";
    setTimeout(() => toast.style.display = "none", duracion);
}

// Crear marcador cuadrado grande
function crearMarkerArrastrable(punto, index) {
    const el = document.createElement('div');
    el.style.width = '16px';
    el.style.height = '16px';
    el.style.backgroundColor = '#0066ff';
    el.style.border = '2px solid white';
    el.style.borderRadius = '4px';
    el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.5)';
    el.style.cursor = 'pointer';

    const marker = new mapboxgl.Marker({
        element: el,
        draggable: true,
        anchor: 'center'
    }).setLngLat([punto.lon, punto.lat]).addTo(map);

    marker.on('drag', () => {
        const lngLat = marker.getLngLat();
        puntos[index] = { lat: lngLat.lat, lon: lngLat.lng };
        dibujarTemp();
    });

    marker.on('dragend', () => {
        const lngLat = marker.getLngLat();
        puntos[index] = { lat: lngLat.lat, lon: lngLat.lng };
        dibujarTemp();
    });

    markersPuntos.push(marker);
}

function dibujarTemp() {
    if (map.getSource("temp")) {
        if (map.getLayer("temp-fill")) map.removeLayer("temp-fill");
        if (map.getLayer("temp-line")) map.removeLayer("temp-line");
        map.removeSource("temp");
    }
    if (puntos.length < 3) return;

    const coords = puntos.map(p => [p.lon, p.lat]);
    coords.push(coords[0]);

    map.addSource("temp", {
        type: "geojson",
        data: { type: "Feature", geometry: { type: "Polygon", coordinates: [coords] }}
    });
    map.addLayer({ id: "temp-fill", type: "fill", source: "temp", paint: { "fill-color": "#555555", "fill-opacity": 0.4 }});
    map.addLayer({ id: "temp-line", type: "line", source: "temp", paint: { "line-color": "#333333", "line-width": 3 }});
}

// Modos
window.modoCrear = () => { reset(); modo = "crear"; };
window.modoEditar = () => { modo = "editar"; };

map.on("click", (e) => {
    if (modo === "crear") agregarPunto(e.lngLat);
    if (modo === "editar") seleccionarGeocerca(e.lngLat);
});

function agregarPunto(lngLat) {
    const punto = { lat: lngLat.lat, lon: lngLat.lng };
    const index = puntos.length;
    puntos.push(punto);
    crearMarkerArrastrable(punto, index);
    dibujarTemp();
}

function seleccionarGeocerca(lngLat) {
    Object.entries(cache).forEach(([id, data]) => {
        if (!data.puntos || data.puntos.length < 3) return;
        const coords = data.puntos.map(p => [p.lon, p.lat]);
        coords.push(coords[0]);

        if (turf.booleanPointInPolygon(turf.point([lngLat.lng, lngLat.lat]), turf.polygon([coords]))) {
            seleccionId = id;
            nombreActual = data.nombre || "";
            modo = "crear";
            limpiarEdicion();
            puntos = JSON.parse(JSON.stringify(data.puntos));
            puntos.forEach((p, i) => crearMarkerArrastrable(p, i));
            dibujarTemp();
        }
    });
}

// Guardar
window.guardar = async () => {
    if (puntos.length < 3) return showToast("❌ Mínimo 3 puntos", 3000);

    const nombre = prompt("Nombre de la geocerca:", nombreActual || "Geocerca nueva");
    if (nombre === null || !nombre.trim()) return;

    try {
        const dataGuardar = { nombre: nombre.trim(), puntos };
        if (seleccionId) {
            await setDoc(doc(db, "geocercas", seleccionId), dataGuardar);
            showToast("✅ Geocerca actualizada");
        } else {
            await addDoc(collection(db, "geocercas"), dataGuardar);
            showToast("✅ Nueva geocerca guardada");
        }
        reset();
    } catch (e) {
        showToast("❌ Error al guardar");
    }
};

window.eliminarTodo = async () => {
    if (!confirm("¿Eliminar TODAS las geocercas?")) return;
    const snap = await getDocs(collection(db, "geocercas"));
    await Promise.all(snap.docs.map(d => deleteDoc(doc(db, "geocercas", d.id))));
    limpiarMapa();
    reset();
    showToast("🗑️ Todas las geocercas eliminadas");
};

function limpiarMapa() {
    Object.keys(cache).forEach(id => {
        if (map.getLayer(id)) map.removeLayer(id);
        if (map.getLayer(id+"-line")) map.removeLayer(id+"-line");
        if (map.getSource(id)) map.removeSource(id);
        delete cache[id];
    });
}

function limpiarEdicion() {
    puntos = [];
    markersPuntos.forEach(m => m.remove());
    markersPuntos = [];
    if (map.getSource("temp")) {
        if (map.getLayer("temp-fill")) map.removeLayer("temp-fill");
        if (map.getLayer("temp-line")) map.removeLayer("temp-line");
        map.removeSource("temp");
    }
}

function reset() {
    limpiarEdicion();
    seleccionId = null;
    nombreActual = null;
    modo = "normal";
}

// Ir a dispositivo
window.irADispositivo = (id) => {
    const dev = dispositivos[id];
    if (!dev) return;
    map.flyTo({
        center: [dev.lon, dev.lat],
        zoom: 17,
        duration: 1500
    });
};

// Map Load + Listeners
map.on("load", () => {

    // Dispositivos
    onSnapshot(collection(db, "ubicaciones"), (snap) => {
        snap.docChanges().forEach(change => {
            const id = change.doc.id;
            const d = change.doc.data();

            if (change.type === "removed") {
                if (markers[id]) { markers[id].remove(); delete markers[id]; }
                delete dispositivos[id];
                actualizarListaDispositivos();
                return;
            }

            if (d.latitud != null && d.longitud != null) {
                const fecha = d.date ? d.date.toDate() : new Date();
                dispositivos[id] = {
                    lat: d.latitud,
                    lon: d.longitud,
                    ultimaActualizacion: fecha.toLocaleString('es-BO', {hour:'2-digit', minute:'2-digit', second:'2-digit'})
                };

                if (markers[id]) {
                    markers[id].setLngLat([d.longitud, d.latitud]);
                } else {
                    markers[id] = new mapboxgl.Marker({ color: "red" })
                        .setLngLat([d.longitud, d.latitud])
                        .addTo(map);
                }
            }
        });
        actualizarListaDispositivos();
    });

    // Geocercas (gris)
    onSnapshot(collection(db, "geocercas"), (snap) => {
        snap.docChanges().forEach(change => {
            const id = change.doc.id;
            const data = change.doc.data();

            if (change.type === "removed") {
                if (map.getLayer(id)) map.removeLayer(id);
                if (map.getLayer(id+"-line")) map.removeLayer(id+"-line");
                if (map.getSource(id)) map.removeSource(id);
                delete cache[id];
                return;
            }

            cache[id] = data;
            const coords = data.puntos.map(p => [p.lon, p.lat]);
            coords.push(coords[0]);
            const geojson = { type: "Feature", geometry: { type: "Polygon", coordinates: [coords] }};

            if (map.getSource(id)) {
                map.getSource(id).setData(geojson);
            } else {
                map.addSource(id, { type: "geojson", data: geojson });
                map.addLayer({ id: id, type: "fill", source: id, paint: { "fill-color": "#555555", "fill-opacity": 0.35 }});
                map.addLayer({ id: id+"-line", type: "line", source: id, paint: { "line-color": "#333333", "line-width": 3 }});
            }
        });
        actualizarListaDispositivos();
    });
});

// Lista de dispositivos
function calcularEstado(lon, lat) {
    const dentroDe = [];
    Object.entries(cache).forEach(([id, data]) => {
        if (!data.puntos || data.puntos.length < 3) return;
        const coords = data.puntos.map(p => [p.lon, p.lat]); 
        coords.push(coords[0]);
        if (turf.booleanPointInPolygon(turf.point([lon, lat]), turf.polygon([coords]))) {
            dentroDe.push(data.nombre || "Sin nombre");
        }
    });
    return dentroDe.length > 0 
        ? { texto: `🟢 DENTRO DE: ${dentroDe.join(", ")}`, clase: "dentro" }
        : { texto: "🔴 FUERA DE TODAS LAS GEOCERCAS", clase: "fuera" };
}

function actualizarListaDispositivos() {
    const cont = document.getElementById("listaDispositivos");
    cont.innerHTML = "";

    if (Object.keys(dispositivos).length === 0) {
        cont.innerHTML = `<p style="text-align:center;color:#888;">Esperando dispositivos...</p>`;
        return;
    }

    Object.entries(dispositivos).forEach(([id, dev]) => {
        const estado = calcularEstado(dev.lon, dev.lat);
        const div = document.createElement("div");
        div.className = "dispositivo";
        div.innerHTML = `
            <div class="dispositivo-info">
                <strong>${id}</strong><br>
                <span class="info">Lat: ${dev.lat.toFixed(6)} | Lon: ${dev.lon.toFixed(6)}</span><br>
                <span class="info">🕒 ${dev.ultimaActualizacion}</span><br>
                <span class="${estado.clase}">${estado.texto}</span>
            </div>
            <button onclick="irADispositivo('${id}')">Ver</button>
        `;
        cont.appendChild(div);
    });
}