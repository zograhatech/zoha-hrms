/**
 * Cloudflare R2 / AWS S3 Multipart Resumable Storage Helper
 * Implemented with pure Node.js crypto and native fetch/https (Zero external dependencies).
 * Supports chunked multipart uploads up to 5 TB (e.g. 1 GB+ zip files).
 */

const crypto = require('crypto');
const https = require('https');

const isR2Configured = () => {
    return Boolean(
        process.env.R2_ACCOUNT_ID &&
        process.env.R2_ACCESS_KEY_ID &&
        process.env.R2_SECRET_ACCESS_KEY &&
        process.env.R2_BUCKET
    );
};

function hmac(key, string, encoding) {
    return crypto.createHmac('sha256', key).update(string, 'utf8').digest(encoding);
}

function hash(string) {
    return crypto.createHash('sha256').update(string, 'utf8').digest('hex');
}

function getSigningKey(secretKey, dateStamp, region, service) {
    const kDate = hmac('AWS4' + secretKey, dateStamp);
    const kRegion = hmac(kDate, region);
    const kService = hmac(kRegion, service);
    return hmac(kService, 'aws4_request');
}

function getR2Host() {
    const accountId = process.env.R2_ACCOUNT_ID;
    return `${accountId}.r2.cloudflarestorage.com`;
}

/**
 * Execute a signed S3/R2 REST request
 */
function signedS3Request({ method, path, query = {}, body = '', headers = {} }) {
    return new Promise((resolve, reject) => {
        const accessKeyId = process.env.R2_ACCESS_KEY_ID;
        const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
        const region = process.env.R2_REGION || 'auto';
        const service = 's3';
        const host = getR2Host();

        const now = new Date();
        const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
        const dateStamp = amzDate.slice(0, 8);

        const payloadHash = hash(body || '');

        const canonicalHeadersMap = {
            'host': host,
            'x-amz-content-sha256': payloadHash,
            'x-amz-date': amzDate,
            ...headers
        };

        const sortedHeaderKeys = Object.keys(canonicalHeadersMap).map(k => k.toLowerCase()).sort();
        const canonicalHeaders = sortedHeaderKeys.map(k => `${k}:${canonicalHeadersMap[k]}\n`).join('');
        const signedHeaders = sortedHeaderKeys.join(';');

        const sortedQueryKeys = Object.keys(query).sort();
        const canonicalQueryString = sortedQueryKeys
            .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(query[k])}`)
            .join('&');

        const canonicalRequest = [
            method,
            path,
            canonicalQueryString,
            canonicalHeaders,
            signedHeaders,
            payloadHash
        ].join('\n');

        const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
        const stringToSign = [
            'AWS4-HMAC-SHA256',
            amzDate,
            credentialScope,
            hash(canonicalRequest)
        ].join('\n');

        const signingKey = getSigningKey(secretAccessKey, dateStamp, region, service);
        const signature = hmac(signingKey, stringToSign, 'hex');

        const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

        const reqOptions = {
            hostname: host,
            method,
            path: canonicalQueryString ? `${path}?${canonicalQueryString}` : path,
            headers: {
                ...canonicalHeadersMap,
                'Authorization': authorizationHeader,
                'Content-Length': Buffer.byteLength(body)
            }
        };

        const req = https.request(reqOptions, (res) => {
            let resBody = '';
            res.on('data', chunk => resBody += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve({ statusCode: res.statusCode, body: resBody, headers: res.headers });
                } else {
                    reject(new Error(`R2/S3 Error HTTP ${res.statusCode}: ${resBody}`));
                }
            });
        });

        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

/**
 * 1. Initiate Multipart Upload
 */
async function initiateMultipartUpload({ filename, fileType }) {
    const bucket = process.env.R2_BUCKET;
    const key = `chat_attachments/${Date.now()}_${crypto.randomBytes(6).toString('hex')}_${encodeURIComponent(filename.replace(/\s+/g, '_'))}`;
    const path = `/${bucket}/${key}`;

    const res = await signedS3Request({
        method: 'POST',
        path,
        query: { uploads: '' },
        headers: {
            'content-type': fileType || 'application/octet-stream'
        }
    });

    const uploadIdMatch = res.body.match(/<UploadId>(.+?)<\/UploadId>/);
    if (!uploadIdMatch) {
        throw new Error('Failed to parse UploadId from S3/R2 initiate response.');
    }

    const uploadId = uploadIdMatch[1];
    const publicBase = process.env.R2_PUBLIC_URL || `https://${bucket}.${getR2Host()}`;
    const publicUrl = `${publicBase.replace(/\/+$/, '')}/${key}`;

    return { uploadId, key, publicUrl };
}

/**
 * 2. Generate Presigned Part Upload URL (PUT)
 */
function getPresignedPartUrl({ key, uploadId, partNumber, expiresIn = 3600 }) {
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const bucket = process.env.R2_BUCKET;
    const region = process.env.R2_REGION || 'auto';
    const service = 's3';
    const host = getR2Host();

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

    const path = `/${bucket}/${key}`;

    const queryParams = {
        'partNumber': String(partNumber),
        'uploadId': uploadId,
        'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
        'X-Amz-Credential': `${accessKeyId}/${credentialScope}`,
        'X-Amz-Date': amzDate,
        'X-Amz-Expires': String(expiresIn),
        'X-Amz-SignedHeaders': 'host'
    };

    const sortedKeys = Object.keys(queryParams).sort();
    const canonicalQueryString = sortedKeys
        .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`)
        .join('&');

    const canonicalHeaders = `host:${host}\n`;
    const signedHeaders = 'host';
    const payloadHash = 'UNSIGNED-PAYLOAD';

    const canonicalRequest = [
        'PUT',
        path,
        canonicalQueryString,
        canonicalHeaders,
        signedHeaders,
        payloadHash
    ].join('\n');

    const stringToSign = [
        'AWS4-HMAC-SHA256',
        amzDate,
        credentialScope,
        hash(canonicalRequest)
    ].join('\n');

    const signingKey = getSigningKey(secretAccessKey, dateStamp, region, service);
    const signature = hmac(signingKey, stringToSign, 'hex');

    const presignedUrl = `https://${host}${path}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
    return presignedUrl;
}

/**
 * 3. Complete Multipart Upload
 */
async function completeMultipartUpload({ key, uploadId, parts }) {
    const bucket = process.env.R2_BUCKET;
    const path = `/${bucket}/${key}`;

    const sortedParts = [...parts].sort((a, b) => a.partNumber - b.partNumber);
    const partsXml = sortedParts
        .map(p => `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${p.etag.replace(/^"|"$/g, '')}</ETag></Part>`)
        .join('');

    const body = `<CompleteMultipartUpload>${partsXml}</CompleteMultipartUpload>`;

    await signedS3Request({
        method: 'POST',
        path,
        query: { uploadId },
        body,
        headers: {
            'content-type': 'application/xml'
        }
    });

    const publicBase = process.env.R2_PUBLIC_URL || `https://${bucket}.${getR2Host()}`;
    return {
        fileUrl: `${publicBase.replace(/\/+$/, '')}/${key}`,
        key
    };
}

/**
 * 4. Abort Multipart Upload (Cancel/Cleanup)
 */
async function abortMultipartUpload({ key, uploadId }) {
    const bucket = process.env.R2_BUCKET;
    const path = `/${bucket}/${key}`;

    await signedS3Request({
        method: 'DELETE',
        path,
        query: { uploadId }
    });

    return { aborted: true };
}

module.exports = {
    isR2Configured,
    initiateMultipartUpload,
    getPresignedPartUrl,
    completeMultipartUpload,
    abortMultipartUpload
};
