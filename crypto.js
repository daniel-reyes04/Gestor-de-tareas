// crypto.js

// 1. Deriva una clave real a partir de la contraseña del usuario y una sal.
export async function derivarClaveDesdeContrasena(contrasena, sal) {
    const materialBase = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(contrasena),
        'PBKDF2',
        false,
        ['deriveKey']
    );

    // Usa 100,000 iteraciones como recomienda la guía.
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: sal, iterations: 100000, hash: 'SHA-256' },
        materialBase,
        { name: 'AES-GCM', length: 256 },
        false, // La clave no es exportable, se re-deriva cada vez.
        ['encrypt', 'decrypt']
    );
}

// 2. Cifra el texto generando un Vector de Inicialización (IV) único.
export async function cifrarTexto(clave, texto) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const datos = new TextEncoder().encode(texto);
    const cifrado = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, clave, datos);
    
    return { cifrado, iv }; // El IV no es secreto, se guarda con el dato.
}

// 3. Descifra el texto usando la clave y el IV original.
export async function descifrarTexto(clave, { cifrado, iv }) {
    const datos = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, clave, cifrado);
    return new TextDecoder().decode(datos);
}