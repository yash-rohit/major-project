# Certificate Chain 🎓

A blockchain-based certificate management system built with Ethereum, Solidity, and Node.js. This application allows educational institutions to issue, store, and verify digital certificates on the blockchain with tamper-proof security.

## 🌟 Features

- **Student Registration**: Secure admin interface to register new students with encrypted credentials
- **Certificate Issuance**: Upload PDF certificates, calculate cryptographic hashes, and register on Ethereum blockchain
- **Blockchain Verification**: Immutable certificate records stored on Ethereum smart contracts
- **Certificate Verification**: Public-facing verifier to authenticate certificates using blockchain data
- **Admin Dashboard**: Comprehensive admin panel to manage students and certificates
- **Responsive UI**: Modern, user-friendly interface built with Tailwind CSS

## 🛠️ Technology Stack

- **Blockchain**: Ethereum (Solidity Smart Contracts)
- **Backend**: Node.js with Express.js
- **Frontend**: HTML5, CSS3, JavaScript, Tailwind CSS
- **Database**: JSON-based student records (student_db.json)
- **Development**: Truffle Framework, Ganache
- **Smart Contracts**: CertificateRegistry.sol

## 📋 Prerequisites

Before you begin, ensure you have installed:

- **Node.js** (v14 or higher) - [Download](https://nodejs.org/)
- **Truffle** - `npm install -g truffle`
- **Ganache CLI** - `npm install -g ganache-cli`
- **Git** - [Download](https://git-scm.com/)
- **MetaMask** (Browser Extension) - Optional for web3 interactions

## 📦 Installation & Setup

### 1. Clone or Extract the Project

```powershell
cd c:\Users\hp\Desktop\Code
```

### 2. Install Dependencies

```powershell
npm install
```

### 3. Start Ganache (Local Blockchain)

Open a **new PowerShell terminal** and run:

```powershell
ganache-cli
```

This will start a local blockchain on `http://localhost:8545` with 10 test accounts. Keep this terminal running.

**Output example:**
```
Ganache CLI v6.x.x (ganache-core: 2.x.x)

Available Accounts
==================
(0) 0x1234567890123456789012345678901234567890
(1) 0x0987654321098765432109876543210987654321
...

Listening on 127.0.0.1:8545
```

### 4. Compile Smart Contracts

In a **second PowerShell terminal**, run:

```powershell
truffle compile
```

Expected output:
```
Compiling .\contracts\CertificateRegistry.sol...
Writing artifacts to .\build\contracts
```

### 5. Migrate Smart Contracts to Blockchain

```powershell
truffle migrate
```

Expected output:
```
Starting migrations...
> Network name: 'development'
> Network id: 5777
> Block limit: 6721975

1_deploy_contracts.js
====================

   Deploying 'CertificateRegistry'
   ==============================
   > transaction hash:    0x1234...
   > Blocks: 0        Seconds: 0
   > contract address:    0xABCD...
   > total cost:          0.005 ETH
```

**Save the contract address** - you may need it later.

### 6. Start the Server

In the **second PowerShell terminal** (after migration completes), run:

```powershell
node server.js
```

Expected output:
```
Server running on http://localhost:5000
Connected to database at: student_db.json
```

The server is now live! Keep this terminal running.

## 🚀 Using the Application

### Access the Application

- **Home Page**: http://localhost:5000/
- **Admin Dashboard**: http://localhost:5000/public/admin/admin_dashboard.html
- **Certificate Verifier**: http://localhost:5000/public-verifier/verify.html

### Admin Workflow

#### Step 1: Register a New Student
1. Go to **Admin Dashboard** → Click **"1. Register New Student"**
2. Fill in student details:
   - Full Name
   - Email
   - Course/Program
   - Enrollment ID
3. Click **"Register Student"**
4. System creates login credentials (saved in `student_db.json`)

#### Step 2: Issue a Certificate
1. Go to **Admin Dashboard** → Click **"2. Issue Certificate"**
2. Select the student from dropdown
3. Upload a PDF file
4. Enter certificate details (issue date, expiry, etc.)
5. Click **"Issue Certificate"**
6. System:
   - Calculates SHA-256 hash of PDF
   - Stores certificate on blockchain
   - Generates QR code for verification
7. Certificate is now immutable on Ethereum!

#### Step 3: View All Records
1. Go to **Admin Dashboard** → Click **"3. View All Records"**
2. Browse all registered students and issued certificates
3. View certificate details and blockchain transaction hash

### Student & Public Verification

#### For Students:
1. Login to **Student Dashboard**: http://localhost:5000/public/student/login.html
2. View issued certificates
3. Download or share certificate details

#### For Certificate Verification (Public):
1. Go to **Certificate Verifier**: http://localhost:5000/public-verifier/verify.html
2. Enter certificate ID or scan QR code
3. System verifies:
   - Certificate exists on blockchain
   - PDF hash matches stored hash
   - Certificate hasn't been tampered with
4. View verification results

## 📁 Project Structure

```
Code/
├── contracts/
│   └── CertificateRegistry.sol      # Main smart contract
├── migrations/
│   └── 1_deploy_contracts.js        # Contract deployment script
├── public/
│   ├── index.html                   # Home page
│   ├── app.js                       # Frontend logic
│   ├── admin/                       # Admin dashboard pages
│   │   ├── admin_dashboard.html
│   │   ├── create_student.html
│   │   ├── issue_certificate.html
│   │   └── view_records.html
│   ├── student/                     # Student pages
│   │   ├── login.html
│   │   └── student_dashboard.html
│   ├── verifier/                    # Verification pages
│   │   └── verify_certificate.html
│   ├── assets/                      # CSS, JS, images
│   │   ├── css/
│   │   ├── js/
│   │   └── images/
│   ├── qrcodes/                     # Generated QR codes
│   └── vendor/                      # Third-party libraries
├── public-verifier/                 # Public verification interface
│   ├── verify.html
│   └── _redirects
├── build/
│   └── contracts/                   # Compiled contract artifacts
├── server.js                        # Main Express server
├── package.json                     # Dependencies
├── truffle-config.js                # Truffle configuration
├── student_db.json                  # Student records database
└── README.md                        # This file
```

## 🔧 Configuration

### server.js
- **Port**: 5000 (change `const PORT = 5000;` to modify)
- **Database**: `student_db.json` (file-based storage)

### truffle-config.js
- **Network**: Development (Ganache on localhost:8545)
- **Gas Limit**: 6721975 (standard limit)

### Smart Contract (CertificateRegistry.sol)
- **Functions**:
  - `registerCertificate()` - Add new certificate
  - `verifyCertificate()` - Check certificate authenticity
  - `getCertificateDetails()` - Retrieve certificate info

## 🐛 Troubleshooting

### Issue: "Connection refused" when starting server

**Solution**: Ensure Ganache is running in another terminal:
```powershell
ganache-cli
```

### Issue: "Contracts not compiled" error

**Solution**: Compile and migrate contracts:
```powershell
truffle compile
truffle migrate
```

### Issue: "student_db.json not found"

**Solution**: The file is auto-created on first student registration. Or manually create:
```powershell
echo '{"students":[]}' > student_db.json
```

### Issue: QR codes not generating

**Solution**: Ensure `public/qrcodes/` directory exists and is writable.

### Issue: MetaMask showing wrong network

**Solution**: 
1. Click MetaMask extension
2. Click network dropdown → Select "Localhost 8545"
3. Refresh the page

### Issue: Transaction fails with "Out of gas"

**Solution**: Increase gas in contract call or restart Ganache to reset accounts.

### Issue: Port 5000 already in use

**Solution**: Change port in `server.js`:
```javascript
const PORT = 3000; // Change to available port
```

## 📝 Sample Test Workflow

1. **Register Student**: 
   - Name: "John Doe"
   - Email: "john@example.com"
   - ID: "STU001"

2. **Create Certificate**:
   - Upload any PDF file
   - Issue date: 2025-01-15
   - Certificate ID: "CERT-2025-001"

3. **Verify Certificate**:
   - Use generated QR code or Certificate ID
   - View blockchain verification proof

## 🔐 Security Features

✅ Blockchain immutability - Certificates cannot be altered after registration
✅ SHA-256 hashing - Ensures PDF integrity
✅ Admin authentication - Controlled access to certificate issuance
✅ QR code generation - Easy verification for third parties
✅ Transaction verification - Ethereum blockchain confirmation

## 📄 License

This project is created for educational purposes. Feel free to modify and use as needed.

## 👥 Credits

- **Smart Contract**: Solidity/Ethereum
- **Frontend**: Tailwind CSS, Lucide Icons
- **Backend**: Node.js/Express
- **Blockchain**: Truffle Framework & Ganache

## 📞 Support

For issues or questions:
1. Check the **Troubleshooting** section above
2. Review `steps.md` for additional setup notes
3. Check server.js logs for detailed error messages
4. Verify Ganache is running and contracts are deployed

## 🎯 Next Steps

- [ ] Deploy to Ethereum Testnet (Sepolia/Goerli)
- [ ] Add email notifications for certificate issuance
- [ ] Implement two-factor authentication for admin
- [ ] Create batch certificate upload feature
- [ ] Add certificate expiration reminders

---

**Happy Certificate Issuing! 🚀**

Last Updated: November 22, 2025
