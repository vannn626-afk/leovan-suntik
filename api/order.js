const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const BASE_URL = 'https://zefame.com';
const API_URL = 'https://api.zefame.com/api_free.php';
const TURNSTILE_SITEKEY = '0x4AAAAAACWzOmyoRZoUyJWP';
const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36';

// --- KONFIGURASI VAMX API ---
const VAMX_API_KEY = 'vamx_live_999554ae3dff4f621099e9dbdef6aef4';
const VAMX_ENDPOINT = 'https://vamxapi.my.id/api/v1/tools/captchax';

function getUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Fungsi Bypass Turnstile pake VamX
async function solveTurnstile(urlTarget) {
    try {
        const formData = new URLSearchParams();
        formData.append('type', 'turnstile');
        formData.append('sitekey', TURNSTILE_SITEKEY);
        formData.append('siteurl', urlTarget);
        formData.append('action', 'login'); // Default action, kadang gak ngaruh
        formData.append('timeout', '45');

        const res = await fetch(VAMX_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'x-api-key': VAMX_API_KEY,
                'User-Agent': DEFAULT_UA
            },
            body: formData.toString()
        });

        if (res.ok) {
            const data = await res.json();
            // Kadang responsenya ada di data.result.token, data.token, atau data.data.token
            if (data && data.status === true) {
                return data.result?.token || data.token || data.data?.token;
            } else {
                console.log("VamX Error:", data);
            }
        }
    } catch (e) {
        console.log("VamX Connection Error:", e.message);
    }
    return '';
}

function extractIdentifiers(link) {
    let videoId = '', postId = '', username = '';
    const ttVideoMatch = link.match(/\/video\/(\d+)/i) || link.match(/\/photo\/(\d+)/i);
    if (ttVideoMatch) videoId = ttVideoMatch[1];
    const ttUserMatch = link.match(/@([a-zA-Z0-9_.-]+)/i);
    if (ttUserMatch) username = ttUserMatch[1];
    const igReelMatch = link.match(/instagram\.com\/(?:reel|p)\/([A-Za-z0-9_-]+)/i);
    if (igReelMatch) postId = igReelMatch[1];
    const igUserMatch = link.match(/instagram\.com\/([a-zA-Z0-9_.-]+)\/?(?:\?|$)/i);
    if (igUserMatch && !['reel', 'p', 'stories', 'explore'].includes(igUserMatch[1].toLowerCase())) {
        if (!username) username = igUserMatch[1];
    }
    const ytMatch = link.match(/(?:v=|\/shorts\/|\.be\/)([a-zA-Z0-9_-]{11})/i);
    if (ytMatch) videoId = ytMatch[1];
    const twMatch = link.match(/\/status\/(\d+)/i);
    if (twMatch) postId = twMatch[1];
    if (!link.startsWith('http') && /^[a-zA-Z0-9_.-]+$/.test(link)) username = link.replace(/^@/, '');
    return { videoId, postId, username };
}

async function checkVideoIdRemote(link) {
    try {
        const form = new URLSearchParams();
        form.append('action', 'checkVideoId');
        form.append('link', link);
        const res = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'origin': BASE_URL,
                'referer': `${BASE_URL}/free-services`,
                'user-agent': DEFAULT_UA
            },
            body: form.toString()
        });
        const json = await res.json();
        if (json.success && json.data?.videoId) return json.data.videoId;
    } catch (_) {}
    return '';
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const query = require('url').parse(req.url, true).query;

    if (!query.id || !query.link) {
        return res.status(400).json({ status: false, message: 'ID & Link wajib diisi!' });
    }

    try {
        const sid = String(query.id).trim();
        const link = query.link.trim();
        
        let { videoId, postId, username } = extractIdentifiers(link);
        if (!videoId && (link.includes('tiktok') || link.includes('tt.site'))) {
            const remoteVid = await checkVideoIdRemote(link);
            if (remoteVid) videoId = remoteVid;
        }

        // Nembak VamX buat dapetin token
        let token = await solveTurnstile(`${BASE_URL}/free-services`);
        
        if (!token) throw new Error('Gagal mendapatkan token Turnstile dari VamX. Cek limit/API Key lu.');

        const form = new URLSearchParams();
        form.append('service', sid);
        form.append('link', link);
        form.append('uuid', getUUID());
        form.append('cf_token', token);
        if (videoId) form.append('videoId', videoId);
        if (postId) form.append('postId', postId);
        if (username) form.append('username', username);

        const response = await fetch(`${API_URL}?action=order`, {
            method: 'POST',
            headers: {
                'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'origin': BASE_URL,
                'referer': `${BASE_URL}/free-services`,
                'user-agent': DEFAULT_UA
            },
            body: form.toString()
        });

        const json = await response.json().catch(() => null);
        if (!json) throw new Error(`HTTP ${response.status}: Respons invalid dari Zefame`);
        if (!json.success) throw new Error(json.message || 'Gagal mengirim order ke Zefame');

        return res.status(200).json({
            status: true, message: json.message || 'Order berhasil dikirim!',
            data: { serviceId: sid, target: link, orderId: json.data?.orderId || null, raw: json.data }
        });
    } catch (error) {
        return res.status(500).json({ status: false, message: error.message });
    }
};
