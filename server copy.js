/**
 * Node.js Server for Student Certificate Verification
 * * This server handles API requests, file uploads, hashing, and interaction 
 * with the Ethereum blockchain (Ganache) via web3.js.
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
const bcrypt = require('bcrypt'); // REQUIRED: Used for secure password hashing

const app = express();
const PORT = process.env.PORT || 3000;
const SALT_ROUNDS = 10; // For bcrypt hashing

// Middleware Setup
app.use(bodyParser.json());
// Ensure 'public' directory is available for static file serving (HTML, images, PDFs)
app.use(express.static(path.join(__dirname, 'public'))); 
app.use(bodyParser.urlencoded({ extended: true }));

// -----------------------------------------------------------
// BLOCKCHAIN AND WEB3 SETUP
// -----------------------------------------------------------
const GANACHE_URL = 'http://127.0.0.1:7545';
const web3 = new Web3(GANACHE_URL); 

// !!! DEPLOYMENT DETAILS - FILLED IN BASED ON YOUR PREVIOUS SUCCESSFUL MIGRATION !!!
// Contract Address: 0x0c90B1bEEFf8E29364e4300958d80fe0add5Cf78
const CONTRACT_ADDRESS = '0x0c90B1bEEFf8E29364e4300958d80fe0add5Cf78'; 
// Admin Wallet: 0x3D528a8c8c2AC5627F85F857f00222f6d0f66675
const ADMIN_WALLET = '0x3D528a8C8c2AC5687De4BE92BBaeD087C0c95472'; // Admin's public key
const ADMIN_PRIVATE_KEY = '0x85791710d1e380127defe89cdb9e218c93a220ebc577264f36b6343d26a9ba19'; // Admin's private key for signing transactions

// Load Contract ABI (Assuming the build/contracts directory structure)
const CertificateRegistryABI = require('./build/contracts/CertificateRegistry.json').abi;
const registryContract = new web3.eth.Contract(CertificateRegistryABI, CONTRACT_ADDRESS);

// -----------------------------------------------------------
// SIMULATED DATABASE SETUP (for Student Accounts and Certificate Metadata)
// -----------------------------------------------------------
const STUDENT_DB_PATH = path.join(__dirname, 'student_db.json');
// studentDB structure: { rollNumber: { mailId, hashedPassword, studentName, ..., certificates: [] } }
let studentDB = {}; 

/**
 * Loads student data from the local JSON file. Creates an empty file if it doesn't exist.
 */
function loadStudents() {
    try {
        if (fs.existsSync(STUDENT_DB_PATH)) {
            const data = fs.readFileSync(STUDENT_DB_PATH, 'utf8');
            studentDB = JSON.parse(data);
            console.log(`[DB] Loaded ${Object.keys(studentDB).length} student records from ${STUDENT_DB_PATH}`);
        } else {
            fs.writeFileSync(STUDENT_DB_PATH, JSON.stringify({}), 'utf8');
            console.log(`[DB] Created empty student database file at ${STUDENT_DB_PATH}`);
        }
    } catch (e) {
        console.error('[DB] Error loading student database:', e);
        studentDB = {};
    }
}

/**
 * Saves the current in-memory student database to the local JSON file.
 */
function saveStudents() {
    try {
        // Use JSON.stringify with null, 4 for pretty printing
        fs.writeFileSync(STUDENT_DB_PATH, JSON.stringify(studentDB, null, 4), 'utf8');
        console.log('[DB] Student records saved to file.');
    } catch (e) {
        console.error('[DB] Error saving student database:', e);
    }
}

loadStudents(); // Initialize the database on server start

// -----------------------------------------------------------
// FILE STORAGE CONFIGURATION
// -----------------------------------------------------------
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Ensure destination directories exist
        const certsDir = path.join(__dirname, 'public/certificates');
        const imgsDir = path.join(__dirname, 'public/imgs');
        if (!fs.existsSync(certsDir)) fs.mkdirSync(certsDir, { recursive: true });
        if (!fs.existsSync(imgsDir)) fs.mkdirSync(imgsDir, { recursive: true });

        if (file.fieldname === 'pdfFile') {
            cb(null, certsDir);
        } else if (file.fieldname === 'studentPhoto') {
            cb(null, imgsDir);
        }
    },
    filename: (req, file, cb) => {
        // Naming convention: [timestamp]-[original filename]
        cb(null, Date.now() + '-' + file.originalname.replace(/ /g, '_'));
    }
});
const upload = multer({ storage: storage });

// -----------------------------------------------------------
// HELPER FUNCTIONS
// -----------------------------------------------------------

/**
 * Generates the SHA-256 hash of a file.
 * @param {string} filePath - Path to the file.
 * @returns {Promise<string>} The SHA-256 hash string.
 */
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
// ADMIN API ENDPOINTS
// -----------------------------------------------------------

/**
 * API: Create a new student account (saves to simulated database).
 * Endpoint: /api/admin/create-student-account
 */
app.post('/api/admin/create-student-account', async (req, res) => {
    const { rollNumber, mailId, password, studentName, studentClass, department, yearOfPass, percentage } = req.body;

    // Validate essential fields
    if (!rollNumber || !mailId || !password || !studentName) {
        return res.status(400).json({ success: false, message: 'Missing required fields: Roll Number, Email, Password, or Student Name.' });
    }

    if (studentDB[rollNumber]) {
        return res.status(409).json({ success: false, message: `Student with Roll Number ${rollNumber} already exists.` });
    }

    try {
        // Securely hash the password
        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

        // Store new student data in the simulated database
        studentDB[rollNumber] = {
            mailId: mailId,
            hashedPassword: hashedPassword,
            studentName: studentName,
            studentClass: studentClass,
            department: department,
            yearOfPass: yearOfPass,
            percentage: percentage,
            certificates: [] // Initialize an empty array for future certificates
        };

        saveStudents(); // Save the updated in-memory object to the file

        console.log(`[DB] Successfully created student account for: ${rollNumber}`);
        res.json({ success: true, message: `Student ${rollNumber} account created successfully.` });

    } catch (error) {
        console.error('Student Account Creation Error:', error);
        res.status(500).json({ success: false, message: 'Failed to create student account due to a server error.' });
    }
});


/**
 * API: Issue Certificate (Handles upload, hashing, and blockchain transaction)
 * Endpoint: /api/admin/issue-certificate
 */
app.post('/api/admin/issue-certificate', upload.fields([{ name: 'pdfFile', maxCount: 1 }, { name: 'studentPhoto', maxCount: 1 }]), async (req, res) => {
    
    // 1. Validate Upload and Input
    if (!req.files || !req.files['pdfFile'] || !req.files['studentPhoto']) {
        return res.status(400).json({ success: false, message: 'Both PDF certificate and student photo must be uploaded.' });
    }
    
    const { studentId, name, department, yearOfPass, studentClass, percentage } = req.body;
    
    // Check if the student ID exists in the database before issuing
    if (!studentDB[studentId]) {
        return res.status(404).json({ success: false, message: `Student with ID ${studentId} must be registered first via the 'Create Student Account' page.` });
    }

    const pdfPath = req.files['pdfFile'][0].path;
    const photoPath = req.files['studentPhoto'][0].path;
    let certHash;
    const qrDir = path.join(__dirname, 'public/imgs/qrcodes');
    if (!fs.existsSync(qrDir)) fs.mkdirSync(qrDir, { recursive: true });
    let qrCodeFilename = `${studentId}-${Date.now()}.png`;
    let qrCodeRelativePath = `imgs/qrcodes/${qrCodeFilename}`; // Relative path for the client
    let qrCodeFullPath = path.join(qrDir, qrCodeFilename);
    
    try {
        // 2. Hash the PDF file
        const hashHex = await hashFile(pdfPath);
        certHash = '0x' + hashHex; 
        
        // 3. Generate QR Code containing the certificate hash
        await QRCode.toFile(qrCodeFullPath, certHash);
        
        // 4. Prepare Blockchain Transaction
        const txData = registryContract.methods.issueCertificate(certHash, studentId).encodeABI();
        
        // Estimate Gas (crucial step for successful transaction)
        const gasEstimate = await web3.eth.estimateGas({
            from: ADMIN_WALLET,
            to: CONTRACT_ADDRESS,
            data: txData,
        });

        const tx = {
            from: ADMIN_WALLET,
            to: CONTRACT_ADDRESS,
            data: txData,
            gas: gasEstimate
        };
        
        // 5. Sign and Send Transaction
        const signedTx = await web3.eth.accounts.signTransaction(tx, ADMIN_PRIVATE_KEY);
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

        // 6. Save Certificate Metadata to Local Database
        const pdfPublicPath = pdfPath.replace(path.join(__dirname, 'public'), '');
        const photoPublicPath = photoPath.replace(path.join(__dirname, 'public'), '');
        
        studentDB[studentId].certificates.push({
            certificateHash: certHash,
            pdfFilePath: pdfPublicPath, // Public path for download
            photoFilePath: photoPublicPath, 
            qrCodePath: qrCodeRelativePath, // Public path for display
            blockchainTxHash: receipt.transactionHash,
            issueTimestamp: new Date().toISOString()
        });

        saveStudents(); 

        res.json({ 
            success: true, 
            message: 'Certificate issued and blockchain transaction confirmed.', 
            hash: certHash, 
            txHash: receipt.transactionHash,
            qrCodePath: `/${qrCodeRelativePath}` // Return the public path for the client
        });

    } catch (error) {
        console.error('Certificate Issuance Error:', error);
        // Clean up files if the process (especially blockchain part) failed
        if (pdfPath && fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath); 
        if (photoPath && fs.existsSync(photoPath)) fs.unlinkSync(photoPath); 
        if (qrCodeFullPath && fs.existsSync(qrCodeFullPath)) fs.unlinkSync(qrCodeFullPath);
        res.status(500).json({ success: false, message: `Failed to issue certificate. Details: ${error.message}` });
    }
});


// -----------------------------------------------------------
// STUDENT LOGIN AND RETRIEVAL API
// -----------------------------------------------------------

/**
 * API: Student Login
 * Endpoint: /api/student/login
 */
app.post('/api/student/login', async (req, res) => {
    const { rollNumber, password } = req.body;

    if (!rollNumber || !password) {
        return res.status(400).json({ success: false, message: 'Roll Number and Password are required.' });
    }

    const studentRecord = studentDB[rollNumber];
    
    if (!studentRecord) {
        return res.status(404).json({ success: false, message: 'Invalid Roll Number or account not found.' });
    }

    try {
        // Compare the submitted password with the stored hash
        const isMatch = await bcrypt.compare(password, studentRecord.hashedPassword);

        if (isMatch) {
            // Return essential (non-sensitive) details upon successful login
            res.json({ 
                success: true, 
                message: 'Login successful.',
                rollNumber: rollNumber,
                studentName: studentRecord.studentName,
                department: studentRecord.department,
                yearOfPass: studentRecord.yearOfPass
            });
        } else {
            res.status(401).json({ success: false, message: 'Invalid Roll Number or password.' });
        }
    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ success: false, message: 'An internal error occurred during login.' });
    }
});


/**
 * API: Retrieve all certificate metadata for a logged-in student.
 * Endpoint: /api/student/certificates/:rollNumber
 */
app.get('/api/student/certificates/:rollNumber', async (req, res) => {
    const rollNumber = req.params.rollNumber;
    
    try {
        const studentRecord = studentDB[rollNumber];

        if (!studentRecord) {
             return res.status(404).json({ success: false, message: 'Student roll number not found.' });
        }

        // Map and filter certificates to only include public/safe fields for the client
        const safeCertificates = (studentRecord.certificates || []).map(cert => ({
            certificateHash: cert.certificateHash,
            pdfDownloadUrl: cert.pdfFilePath, 
            photoFilePath: cert.photoFilePath, 
            qrCodePath: cert.qrCodePath, 
            issueTimestamp: cert.issueTimestamp,
            // Include student's profile info with each certificate entry
            studentName: studentRecord.studentName,
            department: studentRecord.department,
            yearOfPass: studentRecord.yearOfPass,
            studentClass: studentRecord.studentClass,
            percentage: studentRecord.percentage
        }));
        
        res.json({ success: true, certificates: safeCertificates });

    } catch (error) {
        console.error('Student certificate retrieval error:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve certificates.' });
    }
});

// -----------------------------------------------------------
// VERIFIER API ENDPOINT
// -----------------------------------------------------------

/**
 * API: Verify Certificate Hash against the Blockchain
 * Endpoint: /api/verifier/verify-hash
 * Requires: certificateHash (bytes32 hex string)
 */
app.post('/api/verifier/verify-hash', async (req, res) => {
    const { certificateHash } = req.body;

    if (!certificateHash || certificateHash.length !== 66 || !certificateHash.startsWith('0x')) {
        return res.status(400).json({ success: false, message: 'Invalid certificate hash format. Must be a 0x-prefixed bytes32 hex string.' });
    }

    try {
        // 1. Check Blockchain for existence and details
        const details = await registryContract.methods.getCertificateDetails(certificateHash).call();
        const [issuer, timestamp, isValid, studentId] = details; // studentId is retrieved from the blockchain
        
        let status;
        let dbDetails = null; // Off-chain metadata

        if (issuer !== '0x0000000000000000000000000000000000000000' && isValid) {
            status = 'VALID';
            
            // 2. Attempt to retrieve off-chain metadata using the studentId
            const studentRecord = studentDB[studentId];
            if (studentRecord) {
                // Find the specific certificate metadata in the student's record
                const cert = (studentRecord.certificates || []).find(c => c.certificateHash === certificateHash);
                
                dbDetails = {
                    studentId: studentId,
                    studentName: studentRecord.studentName,
                    department: studentRecord.department,
                    yearOfPass: studentRecord.yearOfPass,
                    issueDate: new Date(Number(timestamp) * 1000).toLocaleString(),
                    pdfDownloadUrl: cert ? cert.pdfFilePath : 'N/A',
                    photoFilePath: cert ? cert.photoFilePath : 'N/A'
                };
            }
        } else {
            status = 'INVALID';
        }

        res.json({
            success: true,
            status: status,
            blockchainDetails: {
                issuer: issuer,
                timestamp: Number(timestamp),
                isValid: isValid,
                studentId: studentId
            },
            // Metadata from simulated DB (only provided if VALID)
            metadata: dbDetails
        });

    } catch (error) {
        console.error('Certificate Verification Error:', error);
        res.status(500).json({ success: false, message: 'Failed to verify hash. Check network connection or server logs.' });
    }
});

// -----------------------------------------------------------
// START SERVER
// -----------------------------------------------------------
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`Public files served from: ${path.join(__dirname, 'public')}`);
});
