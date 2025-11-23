/**
 * Node.js Server for Student Certificate Verification
 * This server integrates PostgreSQL (primary) and student_db.json (backup).
 * Blockchain, file upload, QR generation, and UI logic are unchanged.
 */

// -----------------------------------------------------------
// CORE SERVER SETUP AND DEPENDENCIES
// -----------------------------------------------------------
const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const QRCode = require('qrcode');
const Web3 = require('web3').default;
const bcrypt = require('bcrypt');

const db = require('./db'); // <-- PostgreSQL pool (db.js)

const app = express();
const PORT = process.env.PORT || 3000;
const SALT_ROUNDS = 10; // For bcrypt hashing

// Middleware Setup
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));

// -----------------------------------------------------------
// BLOCKCHAIN AND WEB3 SETUP
// -----------------------------------------------------------
const GANACHE_URL = 'http://127.0.0.1:7545';
const web3 = new Web3(GANACHE_URL);

const CONTRACT_ADDRESS = '0xAa2d267756B9093Ef20F96414FD4Ce54Af98be35';
const ADMIN_WALLET = '0x9C9ad0F8cbCADbDf2f8E548730b5Cc6F826633A2';
const ADMIN_PRIVATE_KEY = '0x0bc3e93fa64e11a175e6cefe8a098fd71d02cac7d13bc230eafbafb08e0d4aaa';

let registryContract;
try {
    const abiPath = path.join(__dirname, 'build/contracts/CertificateRegistry.json');
    const CertificateRegistryABI = require(abiPath).abi;
    registryContract = new web3.eth.Contract(CertificateRegistryABI, CONTRACT_ADDRESS);
    console.log('[Web3] Contract loaded successfully.');
} catch (e) {
    console.error('[Web3] ERROR: Could not load contract ABI or connect to Web3. Ensure "build/contracts/CertificateRegistry.json" exists and Ganache is running.', e);
}

// -----------------------------------------------------------
// JSON BACKUP (existing logic)
// -----------------------------------------------------------
const STUDENT_DB_PATH = path.join(__dirname, 'student_db.json');
let studentDB = {}; // in-memory cache of JSON backup

function loadStudentsJSON() {
    try {
        console.log(`[DB Path] Checking: ${STUDENT_DB_PATH}`);
        if (fs.existsSync(STUDENT_DB_PATH)) {
            const data = fs.readFileSync(STUDENT_DB_PATH, 'utf8');
            studentDB = data ? JSON.parse(data) : {};
            console.log(`[DB] Loaded ${Object.keys(studentDB).length} student records from file.`);
        } else {
            fs.writeFileSync(STUDENT_DB_PATH, JSON.stringify({}), 'utf8');
            console.log(`[DB] Created empty student database file.`);
            studentDB = {};
        }
    } catch (e) {
        console.error('[DB] CRITICAL ERROR loading student database:', e);
        studentDB = {};
    }
}

function saveStudentsJSON() {
    try {
        fs.writeFileSync(STUDENT_DB_PATH, JSON.stringify(studentDB, null, 4), 'utf8');
        console.log(`[DB] Successfully saved ${Object.keys(studentDB).length} student records to file.`);
    } catch (e) {
        console.error('[DB] CRITICAL ERROR saving student database:', e);
    }
}

loadStudentsJSON();
// Insert student into PostgreSQL
async function insertStudentInDB(studentId, mailId, name, studentClass, department, yearOfPass, percentage) {
    try {
        const query = `
            INSERT INTO students (student_id, mail_id, student_name, student_class, department, year_of_pass, percentage)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (student_id) DO NOTHING
        `;

        await pool.query(query, [
            studentId,
            mailId,
            name,
            studentClass,
            department,
            yearOfPass,
            percentage
        ]);

        console.log("[PG] Student inserted into PostgreSQL:", studentId);

    } catch (err) {
        console.error("PostgreSQL Student Insert Error:", err);
    }
}


// -----------------------------------------------------------
// FILE STORAGE CONFIGURATION (unchanged)
// -----------------------------------------------------------
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const certsDir = path.join(__dirname, 'public/certificates');
        const imgsDir = path.join(__dirname, 'public/imgs');
        const qrDir = path.join(__dirname, 'public/imgs/qrcodes');

        [certsDir, imgsDir, qrDir].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });

        if (file.fieldname === 'pdfFile') {
            cb(null, certsDir);
        } else if (file.fieldname === 'studentPhoto') {
            cb(null, imgsDir);
        } else {
            cb(null, imgsDir);
        }
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname.replace(/ /g, '_'));
    }
});
const upload = multer({ storage: storage });

// -----------------------------------------------------------
// HELPER FUNCTIONS (unchanged)
// -----------------------------------------------------------
function hashFile(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('error', err => reject(err));
        stream.on('data', chunk => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
    });
}

// -----------------------------------------------------------
// DATABASE HELPERS (Postgres queries, with JSON fallback)
// -----------------------------------------------------------
async function createStudentInDB(rollNumber, mailId, hashedPassword, studentName, studentClass, department, yearOfPass, percentage) {
    const client = db;
    const query = `
        INSERT INTO students (roll_number, mail_id, hashed_password, student_name, student_class, department, year_of_pass, percentage)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (roll_number) DO NOTHING
    `;
    const params = [rollNumber, mailId, hashedPassword, studentName, studentClass || 'N/A', department || 'N/A', yearOfPass ? parseInt(yearOfPass) : null, percentage || 'N/A'];
    await client.query(query, params);
}

async function getStudentFromDB(rollNumber) {
    const client = db;
    const q = `SELECT roll_number, mail_id, hashed_password, student_name, student_class, department, year_of_pass, percentage FROM students WHERE roll_number = $1`;
    const r = await client.query(q, [rollNumber]);
    if (r.rows.length === 0) return null;
    const row = r.rows[0];
    return {
        rollNumber: row.roll_number,
        mailId: row.mail_id,
        hashedPassword: row.hashed_password,
        studentName: row.student_name,
        studentClass: row.student_class,
        department: row.department,
        yearOfPass: row.year_of_pass,
        percentage: row.percentage
    };
}

async function insertCertificateInDB(studentId, certHash, pdfPath, photoPath, qrPath, txHash, issueTimestamp) {
    const client = db;
    const q = `
        INSERT INTO certificates (student_id, certificate_hash, pdf_file_path, photo_file_path, qr_code_path, blockchain_tx_hash, issue_timestamp)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
    `;
    const params = [studentId, certHash, pdfPath, photoPath, qrPath, txHash, issueTimestamp];
    await client.query(q, params);
}

async function getCertificatesForStudentFromDB(rollNumber) {
    const q = `
        SELECT c.certificate_hash, c.pdf_file_path, c.photo_file_path, c.qr_code_path, c.blockchain_tx_hash, c.issue_timestamp,
               s.student_name, s.department, s.year_of_pass, s.student_class, s.percentage
        FROM certificates c
        LEFT JOIN students s ON c.student_id = s.roll_number
        WHERE c.student_id = $1
        ORDER BY c.issue_timestamp DESC
    `;
    const r = await db.query(q, [rollNumber]);
    return r.rows;
}

async function getAllRecordsFromDB() {
    // Fetch students and include their certificates
    const studentsRes = await db.query(`SELECT roll_number, mail_id, student_name, student_class, department, year_of_pass, percentage FROM students`);
    const students = studentsRes.rows;

    // For each student, fetch certificates
    const records = [];
    for (const s of students) {
        const certs = await db.query(`SELECT certificate_hash, pdf_file_path, photo_file_path, qr_code_path, blockchain_tx_hash, issue_timestamp FROM certificates WHERE student_id = $1`, [s.roll_number]);
        const safeStudent = {
            rollNumber: s.roll_number,
            mailId: s.mail_id,
            studentName: s.student_name,
            studentClass: s.student_class,
            department: s.department,
            yearOfPass: s.year_of_pass,
            percentage: s.percentage,
            certificates: certs.rows.map(c => ({
                certificateHash: c.certificate_hash,
                pdfFilePath: c.pdf_file_path,
                photoFilePath: c.photo_file_path,
                qrCodePath: c.qr_code_path,
                blockchainTxHash: c.blockchain_tx_hash,
                issueTimestamp: c.issue_timestamp
            }))
        };
        records.push(safeStudent);
    }
    return records;
}

async function getCertificateRowByHash(certHash) {
    const q = `SELECT c.*, s.student_name FROM certificates c LEFT JOIN students s ON c.student_id = s.roll_number WHERE c.certificate_hash = $1 LIMIT 1`;
    const r = await db.query(q, [certHash]);
    return r.rows[0] || null;
}

// -----------------------------------------------------------
// ADMIN API ENDPOINTS (modified to write to Postgres + JSON backup)
// -----------------------------------------------------------
app.post('/api/admin/create-student-account', async (req, res) => {
    const { rollNumber, mailId, password, studentName, studentClass, department, yearOfPass, percentage } = req.body;

    if (!rollNumber || !mailId || !password || !studentName) {
        return res.status(400).json({ success: false, message: 'Missing required fields: Roll Number, Email, Password, or Student Name.' });
    }

    // Check JSON backup first to avoid duplicate quick-check
    if (studentDB[rollNumber]) {
        return res.status(409).json({ success: false, message: `Student with Roll Number ${rollNumber} already exists.` });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

        // Try to insert into Postgres
        try {
            await createStudentInDB(rollNumber, mailId, hashedPassword, studentName, studentClass, department, yearOfPass, percentage);
        } catch (dbErr) {
            console.error('Postgres insert student error (continuing to JSON backup):', dbErr);
            // We'll still write to JSON backup as fallback
        }

        // Update JSON backup (always)
        studentDB[rollNumber] = {
            mailId: mailId,
            hashedPassword: hashedPassword,
            studentName: studentName,
            studentClass: studentClass || 'N/A',
            department: department || 'N/A',
            yearOfPass: yearOfPass ? parseInt(yearOfPass) : 'N/A',
            percentage: percentage || 'N/A',
            certificates: []
        };
        saveStudentsJSON();

        console.log(`[API] Successfully created student account for: ${rollNumber}`);
        res.json({ success: true, message: `Student ${rollNumber} account created successfully.` });
    } catch (error) {
        console.error('Student Account Creation Error:', error);
        res.status(500).json({ success: false, message: 'Failed to create student account due to a server error.' });
    }
});

app.post('/api/admin/issue-certificate', upload.fields([{ name: 'pdfFile', maxCount: 1 }, { name: 'studentPhoto', maxCount: 1 }]), async (req, res) => {
    if (!req.files || !req.files['pdfFile'] || !req.files['studentPhoto']) {
        return res.status(400).json({ success: false, message: 'Both PDF certificate and student photo must be uploaded.' });
    }

    const { studentId } = req.body;

    // Check Postgres first; fallback to JSON
    let studentRecord;
    try {
        studentRecord = await getStudentFromDB(studentId);
    } catch (err) {
        console.error('Error reading student from Postgres (falling back to JSON):', err);
        studentRecord = null;
    }
    if (!studentRecord) {
        // fallback to JSON backup
        if (!studentDB[studentId]) {
            // cleanup uploaded files
            if (fs.existsSync(req.files['pdfFile'][0].path)) fs.unlinkSync(req.files['pdfFile'][0].path);
            if (fs.existsSync(req.files['studentPhoto'][0].path)) fs.unlinkSync(req.files['studentPhoto'][0].path);
            return res.status(404).json({ success: false, message: `Student with ID ${studentId} must be registered first via the 'Create Student Account' page.` });
        } else {
            studentRecord = {
                rollNumber: studentId,
                mailId: studentDB[studentId].mailId,
                hashedPassword: studentDB[studentId].hashedPassword,
                studentName: studentDB[studentId].studentName,
                studentClass: studentDB[studentId].studentClass,
                department: studentDB[studentId].department,
                yearOfPass: studentDB[studentId].yearOfPass,
                percentage: studentDB[studentId].percentage
            };
        }
    }

    const pdfPath = req.files['pdfFile'][0].path;
    const photoPath = req.files['studentPhoto'][0].path;
    let certHash;
    const qrDir = path.join(__dirname, 'public/imgs/qrcodes');
    let qrCodeFilename = `${studentId}-${Date.now()}.png`;
    let qrCodeRelativePath = `imgs/qrcodes/${qrCodeFilename}`;
    let qrCodeFullPath = path.join(qrDir, qrCodeFilename);

    try {
        const hashHex = await hashFile(pdfPath);
        certHash = '0x' + hashHex;
        await QRCode.toFile(qrCodeFullPath, certHash);

        if (!registryContract) {
            throw new Error("Blockchain contract not initialized. Check Web3 setup.");
        }

        const txData = registryContract.methods.issueCertificate(certHash, studentId).encodeABI();
        const gasEstimate = await web3.eth.estimateGas({ from: ADMIN_WALLET, to: CONTRACT_ADDRESS, data: txData });
        const gasPrice = await web3.eth.getGasPrice();
        const tx = { from: ADMIN_WALLET, to: CONTRACT_ADDRESS, data: txData, gas: gasEstimate.toString(), gasPrice: gasPrice.toString() };
        const signedTx = await web3.eth.accounts.signTransaction(tx, ADMIN_PRIVATE_KEY);
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

        // Save to Postgres (primary) then JSON backup
        const pdfPublicPath = path.relative(path.join(__dirname, 'public'), pdfPath).replace(/\\/g, '/');
        const photoPublicPath = path.relative(path.join(__dirname, 'public'), photoPath).replace(/\\/g, '/');
        const qrPublicPath = qrCodeRelativePath.replace(/\\/g, '/');
        const issueTimestamp = new Date().toISOString();

        try {
            await insertCertificateInDB(studentId, certHash, `/${pdfPublicPath}`, `/${photoPublicPath}`, `/${qrPublicPath}`, receipt.transactionHash, issueTimestamp);
        } catch (dbErr) {
            console.error('Postgres insert certificate error (continuing to JSON backup):', dbErr);
            // continue to JSON backup
        }

        // JSON backup update
        if (!studentDB[studentId]) studentDB[studentId] = {
            mailId: studentRecord.mailId || '',
            hashedPassword: studentRecord.hashedPassword || '',
            studentName: studentRecord.studentName || '',
            studentClass: studentRecord.studentClass || 'N/A',
            department: studentRecord.department || 'N/A',
            yearOfPass: studentRecord.yearOfPass || 'N/A',
            percentage: studentRecord.percentage || 'N/A',
            certificates: []
        };
        studentDB[studentId].certificates.push({
            certificateHash: certHash,
            pdfFilePath: `/${pdfPublicPath}`,
            photoFilePath: `/${photoPublicPath}`,
            qrCodePath: `/${qrPublicPath}`,
            blockchainTxHash: receipt.transactionHash,
            issueTimestamp: issueTimestamp
        });
        saveStudentsJSON();

        res.json({
            success: true,
            message: 'Certificate issued and blockchain transaction confirmed.',
            hash: certHash,
            txHash: receipt.transactionHash,
            qrCodePath: `/${qrPublicPath}`
        });
    } catch (error) {
        console.error('Certificate Issuance Error:', error);
        // Cleanup
        if (pdfPath && fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
        if (photoPath && fs.existsSync(photoPath)) fs.unlinkSync(photoPath);
        if (qrCodeFullPath && fs.existsSync(qrCodeFullPath)) fs.unlinkSync(qrCodeFullPath);
        res.status(500).json({ success: false, message: `Failed to issue certificate. Details: ${error.message}` });
    }
});

// -----------------------------------------------------------
// STUDENT LOGIN AND RETRIEVAL API (Postgres primary, JSON fallback)
// -----------------------------------------------------------
app.post('/api/student/login', async (req, res) => {
    const { rollNumber, password } = req.body;
    if (!rollNumber || !password) {
        return res.status(400).json({ success: false, message: 'Roll Number and Password are required.' });
    }

    try {
        // Try Postgres first
        let studentRecord = null;
        try {
            studentRecord = await getStudentFromDB(rollNumber);
        } catch (err) {
            console.error('Postgres read error in login (falling back to JSON):', err);
            studentRecord = null;
        }

        if (!studentRecord && studentDB[rollNumber]) {
            // Fallback to JSON
            studentRecord = {
                rollNumber: rollNumber,
                mailId: studentDB[rollNumber].mailId,
                hashedPassword: studentDB[rollNumber].hashedPassword,
                studentName: studentDB[rollNumber].studentName
            };
        }

        if (!studentRecord) {
            return res.status(404).json({ success: false, message: 'Invalid Roll Number or account not found.' });
        }

        const isMatch = await bcrypt.compare(password, studentRecord.hashedPassword);
        if (isMatch) {
            res.json({
                success: true,
                message: 'Login successful.',
                rollNumber: rollNumber,
                studentName: studentRecord.studentName
            });
        } else {
            res.status(401).json({ success: false, message: 'Invalid Roll Number or password.' });
        }
    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ success: false, message: 'An internal error occurred during login.' });
    }
});

app.get('/api/student/certificates/:rollNumber', async (req, res) => {
    const rollNumber = req.params.rollNumber;
    try {
        // Try Postgres first
        let certRows = [];
        try {
            certRows = await getCertificatesForStudentFromDB(rollNumber);
        } catch (err) {
            console.error('Error fetching certificates from Postgres (falling back to JSON):', err);
            certRows = [];
        }

        if (certRows && certRows.length > 0) {
            // Map rows to the expected shape
            const safeCertificates = certRows.map(cert => ({
                id: cert.certificate_hash,
                name: cert.student_name || '', // from joined student row
                pdfDownloadUrl: cert.pdf_file_path,
                photoFilePath: cert.photo_file_path,
                qrCodePath: cert.qr_code_path,
                blockchainTxHash: cert.blockchain_tx_hash,
                issueTimestamp: cert.issue_timestamp,
                department: cert.department,
                yearOfPass: cert.year_of_pass,
                studentClass: cert.student_class,
                percentage: cert.percentage
            }));

            // Fetch some student profile info from students table if possible
            const studentRow = await getStudentFromDB(rollNumber).catch(() => null);
            const studentProfile = studentRow ? {
                rollNumber: rollNumber,
                name: studentRow.studentName,
                department: studentRow.department,
                yearOfPass: studentRow.yearOfPass,
                class: studentRow.studentClass,
                percentage: studentRow.percentage,
                mailId: studentRow.mailId
            } : (studentDB[rollNumber] ? {
                rollNumber: rollNumber,
                name: studentDB[rollNumber].studentName,
                department: studentDB[rollNumber].department,
                yearOfPass: studentDB[rollNumber].yearOfPass,
                class: studentDB[rollNumber].studentClass,
                percentage: studentDB[rollNumber].percentage,
                mailId: studentDB[rollNumber].mailId
            } : null);

            return res.json({ success: true, profile: studentProfile, certificates: safeCertificates });
        }

        // If no rows from Postgres, fallback to JSON backup
        const studentRecord = studentDB[rollNumber];
        if (!studentRecord) {
            return res.status(404).json({ success: false, message: 'Student roll number not found.' });
        }
        const safeCertificates = (studentRecord.certificates || []).map(cert => ({
            id: cert.certificateHash,
            name: studentRecord.studentName,
            pdfDownloadUrl: cert.pdfFilePath,
            photoFilePath: cert.photoFilePath,
            qrCodePath: cert.qrCodePath,
            blockchainTxHash: cert.blockchainTxHash,
            issueTimestamp: cert.issueTimestamp,
            department: studentRecord.department,
            yearOfPass: studentRecord.yearOfPass,
            studentClass: studentRecord.studentClass,
            percentage: studentRecord.percentage
        }));
        const studentProfile = {
            rollNumber: rollNumber,
            name: studentRecord.studentName,
            department: studentRecord.department,
            yearOfPass: studentRecord.yearOfPass,
            class: studentRecord.studentClass,
            percentage: studentRecord.percentage,
            mailId: studentRecord.mailId
        };
        res.json({ success: true, profile: studentProfile, certificates: safeCertificates });
    } catch (error) {
        console.error('Student certificate retrieval error:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve certificates.' });
    }
});

// -----------------------------------------------------------
// ADMIN: fetch all records (Postgres primary, JSON fallback)
// -----------------------------------------------------------
app.get('/api/admin/all-records', async (req, res) => {
    try {
        try {
            const records = await getAllRecordsFromDB();
            return res.json({ success: true, records });
        } catch (dbErr) {
            console.error('Error fetching records from Postgres (falling back to JSON):', dbErr);
        }

        // Fallback: produce records from JSON backup
        const records = Object.keys(studentDB).map(roll => {
            const { hashedPassword, ...safeData } = studentDB[roll];
            safeData.rollNumber = roll;
            return safeData;
        });
        res.json({ success: true, records });
    } catch (error) {
        console.error('Error fetching all records:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve records from the server.' });
    }
});

// -----------------------------------------------------------
// VERIFIER API ENDPOINT (use blockchain + Postgres metadata if available)
// -----------------------------------------------------------
app.post('/api/verifier/verify-hash', async (req, res) => {
    const { certificateHash } = req.body;
    if (!certificateHash || certificateHash.length !== 66 || !certificateHash.startsWith('0x')) {
        return res.status(400).json({ success: false, message: 'Invalid certificate hash format. Must be a 0x-prefixed bytes32 hex string (66 characters long).' });
    }
    try {
        if (!registryContract) {
            throw new Error("Blockchain contract not initialized. Check Web3 setup.");
        }

        const details = await registryContract.methods.getCertificateDetails(certificateHash).call();
        const { issuer, timestamp, isValid, studentId } = details;

        let status;
        let dbDetails = null;

        if (issuer !== '0x0000000000000000000000000000000000000000' && isValid) {
            status = 'VALID';
            // Try to fetch certificate metadata from Postgres
            try {
                const certRow = await getCertificateRowByHash(certificateHash);
                if (certRow) {
                    dbDetails = {
                        studentId: certRow.student_id,
                        studentName: certRow.student_name || null,
                        department: null,
                        yearOfPass: null,
                        issueDate: new Date(certRow.issue_timestamp).toLocaleString(),
                        pdfDownloadUrl: certRow.pdf_file_path,
                        photoFilePath: certRow.photo_file_path
                    };
                } else if (studentDB[studentId]) {
                    // fallback to JSON backup
                    const studentRecord = studentDB[studentId];
                    const cert = (studentRecord.certificates || []).find(c => c.certificateHash === certificateHash);
                    dbDetails = {
                        studentId: studentId,
                        studentName: studentRecord.studentName,
                        department: studentRecord.department,
                        yearOfPass: studentRecord.yearOfPass,
                        issueDate: cert ? cert.issueTimestamp : 'N/A',
                        pdfDownloadUrl: cert ? cert.pdfFilePath : 'N/A',
                        photoFilePath: cert ? cert.photoFilePath : 'N/A'
                    };
                }
            } catch (dbErr) {
                console.error('Error reading certificate metadata from Postgres (falling back to JSON):', dbErr);
                if (studentDB[studentId]) {
                    const studentRecord = studentDB[studentId];
                    const cert = (studentRecord.certificates || []).find(c => c.certificateHash === certificateHash);
                    dbDetails = {
                        studentId: studentId,
                        studentName: studentRecord.studentName,
                        department: studentRecord.department,
                        yearOfPass: studentRecord.yearOfPass,
                        issueDate: cert ? cert.issueTimestamp : 'N/A',
                        pdfDownloadUrl: cert ? cert.pdfFilePath : 'N/A',
                        photoFilePath: cert ? cert.photoFilePath : 'N/A'
                    };
                }
            }
        } else {
            status = 'INVALID';
        }

        res.json({
            success: true,
            status: status,
            blockchainDetails: {
                issuer: issuer,
                timestamp: timestamp.toString(),
                isValid: isValid,
                studentId: studentId
            },
            metadata: dbDetails
        });

    } catch (error) {
        console.error('Certificate Verification Error:', error);
        res.status(500).json({ success: false, message: 'Failed to verify hash. Check network connection or server logs.' });
    }
});

// -----------------------------------------------------------
// START SERVER (unchanged)
// -----------------------------------------------------------
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`Public files served from: ${path.join(__dirname, 'public')}`);
});
