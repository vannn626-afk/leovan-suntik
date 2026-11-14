const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const BASE_URL = 'https://zefame.com';
const API_URL = 'https://api.zefame.com/api_free.php';
const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36';

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    try {
        const resApi = await fetch(`${API_URL}?action=config`, {
            headers: { 'origin': BASE_URL, 'referer': `${BASE_URL}/free-services`, 'user-agent': DEFAULT_UA }
        });
        const json = await resApi.json();
        if (!json.success || !json.data) throw new Error(json.message || 'Gagal memuat layanan');

        const flatServices = [];
        for (const [platformKey, platformData] of Object.entries(json.data)) {
            const services = platformData.services || [];
            for (const s of services) {
                flatServices.push({
                    serviceId: s.id,
                    platform: platformData.name || platformKey,
                    name: s.name,
                    available: s.available
                });
            }
        }
        return res.status(200).json({ status: true, total: flatServices.length, services: flatServices });
    } catch (error) {
        return res.status(500).json({ status: false, message: error.message });
    }
};
