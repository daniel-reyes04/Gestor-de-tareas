import { cifrarTexto, descifrarTexto } from './crypto.js';

export function abrirBaseDeDatos() {
    return new Promise((resolve, reject) => {
        const peticion = indexedDB.open('gestor-tareas-db', 2);

        peticion.onupgradeneeded = event => {
            const db = event.target.result;
            
            if (event.oldVersion < 1) {
                const store = db.createObjectStore('tareas', { keyPath: 'id', autoIncrement: true });
                store.createIndex('porPrioridad', 'prioridad', { unique: false });
                store.createIndex('porTitulo', 'titulo', { unique: false });
            }
            
            if (event.oldVersion < 2) {
                db.createObjectStore('outbox', { keyPath: 'idCambio' });
            }
        };

        peticion.onsuccess = event => resolve(event.target.result);
        peticion.onerror = event => reject(event.target.error);
    });
}

export function agregarTarea(db, tarea) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction('tareas', 'readwrite');
        const peticion = tx.objectStore('tareas').add(tarea);
        
        peticion.onsuccess = () => resolve(peticion.result);
        peticion.onerror = () => reject(peticion.error);
        tx.onabort = () => reject(tx.error);
    });
}

export function obtenerTarea(db, id) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction('tareas', 'readonly');
        const peticion = tx.objectStore('tareas').get(id);
        
        peticion.onsuccess = () => resolve(peticion.result);
        peticion.onerror = () => reject(peticion.error);
    });
}

export function obtenerTodasLasTareas(db) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction('tareas', 'readonly');
        const peticion = tx.objectStore('tareas').getAll();
        
        peticion.onsuccess = () => resolve(peticion.result);
        peticion.onerror = () => reject(peticion.error);
    });
}

export function eliminarTareaDB(db, id) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction('tareas', 'readwrite');
        const peticion = tx.objectStore('tareas').delete(id);
        
        peticion.onsuccess = () => resolve(peticion.result);
        peticion.onerror = () => reject(peticion.error);
        tx.onabort = () => reject(tx.error);
    });
}

export async function guardarTareaConNota(db, clave, tarea) {
    const { cifrado, iv } = await cifrarTexto(clave, tarea.notaPrivada);
    
    const registro = {
        ...tarea,
        titulo: tarea.titulo,           // Plano: se puede buscar
        prioridad: tarea.prioridad,     // Plano: tiene índice
        notaCifrada: cifrado,           // Cifrado: ArrayBuffer ilegible
        notaIv: iv                      // Plano: necesario para descifrar
    };
    
    delete registro.notaPrivada; // Quitamos el texto plano antes de guardar
    return agregarTarea(db, registro);
}

export async function leerNotaPrivada(clave, registro) {
    return descifrarTexto(clave, { cifrado: registro.notaCifrada, iv: registro.notaIv });
}

export function completarTareasPorPrioridad(db, prioridadDada) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction('tareas', 'readwrite');
        const indice = tx.objectStore('tareas').index('porPrioridad');
        const cursorPeticion = indice.openCursor(IDBKeyRange.only(prioridadDada));
        let actualizadas = 0;

        cursorPeticion.onsuccess = event => {
            const cursor = event.target.result;
            if (cursor) {
                const registro = cursor.value;
                registro.completada = true; 
                cursor.update(registro); // Reescribe el registro actual usando el cursor
                actualizadas++;
                cursor.continue();       // Avanza al siguiente registro que coincide
            } else {
                resolve(actualizadas);   // Termina cuando ya no hay más resultados
            }
        };

        cursorPeticion.onerror = () => reject(cursorPeticion.error);
        tx.onerror = () => reject(tx.error);
    });
}