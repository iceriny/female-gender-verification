declare const __DEV_SECRET_SALT__: string
declare const __DEV_SECRET_HASH__: string

export async function verifyDevSecret(input: string): Promise<boolean> {
    if (!__DEV_SECRET_HASH__ || !__DEV_SECRET_SALT__) return false
    const enc = new TextEncoder()
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        enc.encode(input),
        { name: 'PBKDF2' },
        false,
        ['deriveBits']
    )
    const bits = await crypto.subtle.deriveBits(
        {
            name: 'PBKDF2',
            hash: 'SHA-256',
            salt: enc.encode(__DEV_SECRET_SALT__),
            iterations: 100000,
        },
        keyMaterial,
        256
    )
    const hash = btoa(String.fromCharCode(...new Uint8Array(bits)))
    return hash === __DEV_SECRET_HASH__
}
