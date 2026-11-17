# ตั้งเครื่องสำหรับดูแล NeoFeed

คู่มือนี้สำหรับแอดมินที่มาดูแล NeoFeed ร่วมกับ Pp ทำตามลำดับบนคอมของตัวเอง ใช้ได้ทั้ง Windows และ Mac ทำครบแล้วรัน `node tools/maintainer-doctor.mjs` ถ้าบรรทัดสุดท้ายขึ้นว่า "พร้อมแล้ว" ก็เริ่มงานได้

ไฟล์นี้บอกวิธีตั้งเครื่อง กฎจริงอยู่ใน `AGENTS.md` และ `REFERENCE.md` ถ้าไฟล์นี้กับสองไฟล์นั้นเขียนไม่ตรงกัน ให้เชื่อสองไฟล์นั้น แล้วแก้ไฟล์นี้ใน PR ถัดไป

## 0. ก่อนเริ่ม

**บัญชีที่ต้องมี** ทุกบัญชีเป็นของตัวเอง ไม่มีขั้นไหนต้องใช้รหัสผ่านของคนอื่น

| บัญชี | ใช้ทำอะไร | ใครเพิ่มให้ |
|---|---|---|
| GitHub | push branch เปิด PR และ merge เข้า `main` เมื่อ CI ผ่าน งานที่เปลี่ยนตัวเลข clinical ต้องรอ Pp อนุมัติก่อน merge | Pp เพิ่มเป็น `maintain` ใน `valhalla-health/neofeed` |
| Google (บัญชี Chula) | แก้ tab `Staff` รันฟังก์ชันที่อนุญาตใน Apps Script editor (ข้อ 7) และใช้ `clasp` | Pp แชร์ Sheet ให้ หลังแจ้ง DPO แล้ว |
| NeoFeed role `admin` | เข้าหน้า Admin ในแอป | Pp เพิ่มแถวของบัญชีนี้ใน tab `Staff` |
| Cloudflare | ถอย frontend เมื่อ Pp บอก และดู log ตอน deploy พัง | Pp เชิญเข้า account ถ้าตกลงกันไว้ |
| Claude (Pro, Max, Team หรือสูงกว่า) | ใช้ Claude Code ใน repo ถ้าจะใช้ | ตัวเอง |

**เครื่องที่ใช้:** บัญชี Google นี้เปิด Sheet ที่มีข้อมูลทารกได้ทุกราย เลยควรใช้คอมที่ตั้งรหัสเข้าเครื่อง และไม่ใช้ร่วมกับคนอื่น ห้ามดาวน์โหลด Sheet หรือไฟล์ backup ลงเครื่อง และห้ามวางข้อมูลผู้ป่วยลงใน chat ของ AI ทุกอย่างที่ต้องลองให้ใช้ dev local ในข้อ 5 แทน ตัวนั้นใช้ทารกสมมติ

## 1. ลงโปรแกรม

Windows ใช้ PowerShell ส่วน Mac ใช้ Terminal และลง [Homebrew](https://brew.sh) ก่อน ลงเสร็จให้ทำตาม Next steps ที่ installer ของ Homebrew พิมพ์ออกมา บน Mac ชิป Apple ถ้าไม่ทำ เครื่องจะหา `brew` ไม่เจอ

ลงสามตัวแรกก่อน แล้วปิด terminal เปิดใหม่ จากนั้นค่อยลง clasp เพราะ terminal ที่เปิดค้างอยู่ยังหา `npm` ที่เพิ่งลงไม่เจอ

| โปรแกรม | ใช้ทำอะไร | Windows | Mac |
|---|---|---|---|
| Git | เก็บโค้ดและส่งขึ้น GitHub | `winget install --id Git.Git -e` | `brew install git` |
| GitHub CLI | sign in GitHub เปิด PR และดู CI | `winget install --id GitHub.cli -e` | `brew install gh` |
| Node.js 22 | build และรัน harness ใช้รุ่นเดียวกับ CI | `winget install --id OpenJS.NodeJS.22 -e` | `brew install node@22` แล้วดูหมายเหตุข้างล่าง |
| clasp 3 (ลงหลังเปิด terminal ใหม่) | ส่ง backend ขึ้น Apps Script | `npm install -g @google/clasp@3` | `npm install -g @google/clasp@3` |
| Claude Code (ถ้าใช้) | agent ที่อ่านกฎของ repo เอง | `irm https://claude.ai/install.ps1 \| iex` | `curl -fsSL https://claude.ai/install.sh \| bash` |

**หมายเหตุ Mac:** `node@22` ไม่ขึ้นใน PATH เอง ให้รันบรรทัดนี้ครั้งเดียวแล้วเปิด Terminal ใหม่

```bash
echo 'export PATH="$(brew --prefix node@22)/bin:$PATH"' >> ~/.zshrc
```

**เช็กว่าลงครบ** แต่ละคำสั่งต้องพิมพ์เลขรุ่นออกมา

```bash
git --version
gh --version
node --version
clasp --version
claude --version
```

`node --version` ควรขึ้นต้นด้วย `v22` ถ้าเครื่องมี Node รุ่นใหม่กว่าอยู่แล้ว ส่วนใหญ่ก็ใช้ได้ แต่ถ้า harness ให้ผลไม่ตรงกับ CI ให้กลับมาใช้ 22 ส่วน Claude Code มีคำสั่ง `claude doctor` ไว้เช็กการติดตั้งของมันเอง วิธีลงแบบอื่นอยู่ที่ [code.claude.com/docs/en/setup](https://code.claude.com/docs/en/setup)

## 2. sign in

ก่อน `clasp login` ให้เปิด [script.google.com/home/usersettings](https://script.google.com/home/usersettings) ด้วยบัญชี Google เดียวกัน แล้วเปิด Google Apps Script API ถ้าไม่เปิด `clasp push` และ `clasp list-deployments` จะไม่ทำงาน

```bash
gh auth login
clasp login
```

- `gh auth login` เลือก GitHub.com, HTTPS แล้ว sign in ผ่าน browser
- `clasp login` sign in ด้วยบัญชี Google ของตัวเองที่ Pp แชร์ Sheet ให้แล้ว แล้วกดอนุญาตหน้า consent ของ clasp
- Cloudflare ใช้แค่ตอนต้องถอย frontend ถ้า Pp เชิญเข้า account แล้ว ให้รัน `npx wrangler@4 login` แล้วเช็กด้วย `npx wrangler@4 whoami`

## 3. ดึง repo และลงเครื่องมือของ repo

```bash
gh repo clone valhalla-health/neofeed
cd neofeed
npm ci --prefix tools
node tools/run_checks.js --install-hooks
npm install --no-save --no-package-lock react@18 react-dom@18 @babel/core@7 @babel/preset-react@7 jsdom@30
```

- `npm ci --prefix tools` ลงเครื่องมือ build (esbuild และ React) ทำครั้งเดียวต่อ clone และทำใหม่เมื่อ `tools/package-lock.json` เปลี่ยน
- `--install-hooks` ตั้ง git hook ของ repo ให้รันเช็กก่อน commit ทำครั้งเดียวต่อ clone
- บรรทัดสุดท้ายลงชุดที่ harness ใช้ `AGENTS.md` ให้รัน harness ที่งานแตะก่อนเปิด PR ทุกครั้ง วิธีรันทีละตัวอยู่ใน `test/README.md`
- เรื่องบรรทัดใหม่ของ Windows ไม่ต้องตั้งอะไร `.gitattributes` บังคับ LF ให้ทุกไฟล์แล้ว

harness บางตัวมีส่วนที่เปิด browser ด้วย Playwright ในเครื่องที่ไม่มี Playwright ส่วนนั้นจะขึ้น SKIP ถือว่าปกติ CI รันส่วนนี้ให้ ถ้าอยากรันในเครื่องด้วย ให้ใส่ `playwright@1` ต่อท้ายบรรทัด `npm install` ข้างบนในคำสั่งเดียวกัน (ลงแยกทีหลังจะลบชุดที่ลงไว้ก่อน) แล้วรัน `npx playwright install chromium`

## 4. เช็กเครื่อง

```bash
node tools/maintainer-doctor.mjs
```

แบบนี้ script อ่านอย่างเดียว ไม่ลงโปรแกรม ไม่ sign in อะไรให้ และไม่เปิดไฟล์ sign in ของใคร (สำหรับ clasp ดูแค่ว่ามีไฟล์ `~/.clasprc.json` หรือยัง) แต่ละบรรทัดขึ้นต้นด้วย

| ขึ้นว่า | แปลว่า |
|---|---|
| `ok` | ผ่าน |
| `FIX` | ต้องแก้ บรรทัดถัดไปบอกคำสั่งที่ใช้แก้ |
| `opt` | ไม่บังคับ |
| `skip` | ข้ามไปตามที่สั่ง |

ถ้าทุกข้อที่บังคับผ่าน บรรทัดสุดท้ายจะขึ้นว่า "พร้อมแล้ว" ถ้าไม่ผ่าน จะบอกชื่อข้อที่ยังต้องแก้

- `--checks` รันเช็กก่อน PR ต่อท้าย (`node tools/run_checks.js --level ci --phase pre`) ส่วนนี้ไม่ได้อ่านอย่างเดียว มันรัน `npm ci --prefix tools` (ดาวน์โหลดใหม่) แล้ว build `compiled/` ทับในเครื่อง และไม่ผ่านถ้า `git status` ยังมีไฟล์ค้าง ไฟล์ใหม่ที่ยังไม่ commit ก็นับ
- `--offline` ข้ามสองข้อที่ต้องต่อ GitHub (sign in และสิทธิ์ใน repo) แบบนี้บรรทัดสุดท้ายจะขึ้น "ยังไม่พร้อม" เสมอ เพราะเช็ก sign in ของ GitHub ไม่ได้

## 5. เปิดแอปในเครื่อง

```bash
node tools/dev-local.mjs
```

แล้วเปิด `http://127.0.0.1:8155` (ต้องเป็น 127.0.0.1 ไม่ใช่ localhost) กด "เข้าด้วย email อื่น" แล้วใช้บัญชีที่ server พิมพ์ออกมาตอนเริ่ม รหัสผ่านเปลี่ยนทุกครั้งที่รัน ตัว dev local รันโค้ด `gas-backend.gs` ตัวจริงในเครื่อง กับทารกสมมติและบัญชีสมมติ ไม่แตะ production เลย ใช้ลองทุกอย่างก่อน PR ได้ ถ้าแก้ backend ให้ปิดแล้วเปิดใหม่

## 6. ใช้ Claude Code ใน repo

เปิด terminal ใน folder `neofeed` แล้วพิมพ์ `claude` ครั้งแรกจะให้ sign in ก่อน และถามว่าเชื่อ folder นี้ไหม ให้ตอบเชื่อ ไม่อย่างนั้น hook ของ repo จะไม่ทำงาน จากนั้น Claude Code จะอ่าน `CLAUDE.md` ของ repo เอง ไฟล์นั้นดึง `AGENTS.md` มาทั้งไฟล์ และโหลด skill ใน `.claude/skills/` (เช่น `neofeed-clinical-rules`) กับ Vera ใน `.claude/agents/vera.md` ให้ใช้ได้เลย

กฎส่วนตัวที่ Pp ตั้งไว้บนเครื่องของ Pp ไม่ได้มากับ repo กฎของ NeoFeed ที่ต้องใช้เลยอยู่ใน `AGENTS.md` และไฟล์ที่ไฟล์นั้นชี้ไป

## 7. กฎที่ต้องรู้ก่อนแก้อะไร

สรุปจาก `AGENTS.md` และ `REFERENCE.md` ตาม `main` ณ วันที่เขียน อ่านต้นฉบับก่อนทำจริง

- **ก่อนเปิด PR** รัน `node tools/run_checks.js --level ci --phase pre` แล้วรัน harness ที่งานนั้นแตะ หรือ `node tools/run_checks.js --level ci --phase sources` ทั้งชุด ส่วน browser ที่ขึ้น SKIP ปล่อยให้ CI รัน
- **หนึ่งงานหนึ่ง PR** PR มี entry ใน `CHANGELOG.md` และบรรทัดของตัวเองใน `STATUS.md` ด้วย
- **merge เข้า `main` ยังไม่ deploy อะไร** แต่คนที่ merge ต้องเปิด PR `main → release` ใน session เดียวกัน ถ้ามีเปิดอยู่แล้วก็ใช้อันนั้น (`REFERENCE.md` § Frontend)
- **merge เข้า `release` คือ deploy ขึ้นทั้งสอง host ทันที** ตอนนี้ต้องให้ Pp บอกก่อนทุกครั้ง (`REFERENCE.md` § Deploying, and rolling back)
- **ถอย frontend** ทำเมื่อ Pp บอกเท่านั้น และอ่าน `REFERENCE.md` § Deploying, and rolling back ก่อน ถ้าถอยข้าม release ของ 2026-10-28 ต้องให้ Pp ถอย backend ก่อน ไม่อย่างนั้น backend จะไม่รับ Submit เลยสักครั้ง ถอยแล้วต้อง revert การแก้นั้นบน `main` และ release ตัว revert ตามไป ไม่อย่างนั้น release ถัดไปจะส่งของเดิมขึ้นอีก
- **backend รันในชื่อคนที่ `update-deployment` ล่าสุด** ห้าม `update-deployment` จากบัญชีตัวเอง ห้าม `clasp deploy` เพราะสร้าง deployment ใหม่ที่ไม่มีใครใช้ และห้ามกดปุ่ม Deploy ใน Apps Script editor ตอนนี้ Pp เป็นคน `update-deployment` (`REFERENCE.md` § Backend (GAS))
- **`clasp push` ทำตอนนั่ง deploy กับ Pp เท่านั้น** เพราะฟังก์ชันที่รันจาก editor ใช้โค้ดที่ push ล่าสุดทันที และ trigger น่าจะใช้ด้วย
- **ฟังก์ชันใน editor รันในชื่อคนกด และปุ่ม Run ส่ง argument ไม่ได้** (รายการนี้ยังรอ Pp ยืนยัน) ตัวที่กด Run เองได้มีแค่ `sheetHealthReport` (นับและรายงาน) ส่วน `setInitialPassword` กับ `clearStaffPassword` ต้องส่ง email (และรหัสผ่านสำหรับ `setInitialPassword`) ไปด้วย เลยต้องเพิ่มฟังก์ชันหนึ่งบรรทัดใน editor การเพิ่มนี้เปลี่ยนโค้ดที่ editor ใช้ทันที และ trigger น่าจะใช้ด้วย เลยทำได้แค่ตอนนั่งกับ Pp บัญชีใหม่ให้พิมพ์แถวใน tab `Staff` เอง ใส่ email, role (`doctor`, `nurse` หรือ `admin`), ชื่อ และ `TRUE` ในช่อง active ระบบจะเขียนรหัสชั่วคราวลงช่อง `temp_password` และผู้ใช้ต้องเปลี่ยนรหัสตอนเข้าครั้งแรก (บัญชี gmail และบัญชีในโดเมนที่ `GOOGLE_WORKSPACE_DOMAINS` ใน `gas-backend.gs` เขียนไว้ เช่น chula.ac.th ไม่มีรหัส เข้าด้วย Google) ส่วนบัญชี `pharmacy` ยังห้ามสร้างจนกว่า Pp จะบอก (`REFERENCE.md` § The TPN room: `pharmacy`) ตัวอื่นทุกตัวให้ Pp บอกก่อน เช่น `exportQi`, `lookupResearchId`, `setupQiExportKey`, `setConfig`, `authorizeHelpMail`, `apply…HeaderColumns`, `backfill…` และฟังก์ชัน backup ทั้งห้าตัว (`setupSheetBackups`, `repairSheetBackups`, `sheetRestoreDrill`, `backupSheetNightly`, `sheetBackupStatus`) `setupSheetBackups` กับ `repairSheetBackups` สร้างไฟล์ backup เปล่าใน Drive ของคนกด จากนั้น backup แต่ละรอบจะคัดลอกข้อมูลทารกทุกรายลงไฟล์เปล่าทีละไฟล์ ถ้าบัญชีที่รัน backup เปิดไฟล์นั้นได้ ส่วน trigger ของ `backupSheetNightly` รันในชื่อคนที่สร้าง trigger
- **Script Properties** ห้ามแก้เองใน Project Settings ถ้า Pp ไม่ได้บอก ยกเว้นลบ `fail_…` ของบัญชีที่ระบบล็อกไว้ เพราะมีคนใส่รหัสผิดครบห้าครั้ง ล็อกนี้ปลดเองใน 15 นาที ให้ลบเมื่อล็อกกลับมาทันทีหลังครบ 15 นาที ชื่อ property คือ `fail_` ตามด้วย SHA-256 ของ email ตัวพิมพ์เล็ก ก่อนลบให้เช็กแถว `lockout` ใน `Audit_Log` ตาม `REFERENCE.md` § Backend (GAS) (ข้อนี้ก็รอ Pp ยืนยัน) ฟังก์ชันบางตัวเขียน Script Property เองเป็นปกติ เช่น `setInitialPassword` เขียน epoch ของบัญชีนั้น
- **งานที่ทำให้ตัวเลข clinical เปลี่ยน** ทั้งบนจอ บนใบสั่ง และบนสติกเกอร์ ต้องให้ Pp อนุมัติก่อน merge งานที่แตะไฟล์ยา ใบสั่งที่พิมพ์ auth หรือข้อมูลผู้ป่วย ต้องรัน Vera ก่อนเปิด PR (`REFERENCE.md` § Pre-PR review (Vera))
- **log ห้ามมีข้อมูลระบุตัวผู้ป่วย** ห้ามใส่ช่องดิบจาก Sheet หรือค่า Script Property ใช้ `sessionId` หรือจำนวนแทน `tools/ci_bans.js` จะทำให้ PR ไม่ผ่าน
- **repo นี้เป็น public** โน้ต product คำขอจากหอ และ feedback อยู่นอก repo ห้ามเอาเข้ามา

## 8. ติดขัด

| อาการ | ลองแบบนี้ |
|---|---|
| Windows ไม่รู้จัก `winget` | ลง "App Installer" จาก Microsoft Store |
| ลงโปรแกรมแล้วแต่ terminal ยังหาไม่เจอ | ปิด terminal แล้วเปิดใหม่ |
| PowerShell ขึ้น `npm.ps1 cannot be loaded` | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` หรือพิมพ์ `npm.cmd`, `npx.cmd` และ `clasp.cmd` แทน |
| `node --version` ไม่ใช่ v22 บน Mac | รันบรรทัด PATH ในข้อ 1 แล้วเปิด Terminal ใหม่ |
| `clasp push` หรือ `clasp list-deployments` ไม่ทำงาน | เปิด Google Apps Script API ตามข้อ 2 |
| doctor ขึ้น FIX ที่ `gh sign in แล้ว` | `gh auth login` ใหม่ |
| doctor ขึ้น FIX ที่สิทธิ์ใน repo | ขอ Pp เพิ่มเป็น `maintain` |
| dev local เปิดแล้ว sign in ไม่ได้ | เปิดด้วย `127.0.0.1` ไม่ใช่ `localhost` และใช้บัญชีที่ server พิมพ์รอบล่าสุด |
| harness ส่วน browser ขึ้น SKIP | ปกติในเครื่องที่ไม่มี Playwright CI รันให้ |
| ไม่แน่ใจว่าทำได้ไหม | ถาม Pp ก่อน โดยเฉพาะทุกอย่างที่ deploy หรือแตะตัวเลข clinical |
