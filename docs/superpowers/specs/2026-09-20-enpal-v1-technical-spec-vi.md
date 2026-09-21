# EnPal Extension V1 — Đặc tả Kỹ thuật

**Trạng thái:** ĐÃ DUYỆT  
**Ngày:** 2026-09-20  
**Revision:** Đã duyệt sau khi khóa kiến trúc qua review đa vai trò  
**Authority:** Tài liệu này là kiến trúc runtime canonical đã được duyệt của EnPal Extension V1.  
**Project Control:** Quản lý dự án / Project Control nằm ngoài learner runtime của EnPal.

---

## 0. Mục tiêu và phạm vi V1

EnPal V1 là một Chrome Extension trên desktop dùng để điều phối các buổi học Speaking và Listening tiếng Anh thông qua ChatGPT Web.

Thiết kế được chủ ý giữ hẹp:

- ChatGPT Web = giáo viên + reasoning engine.
- Chrome Extension = điều phối + xác minh deterministic.
- Google Sheets = trạng thái học tập runtime bền vững.
- Core curriculum = cố định và deterministic.
- Personalization = chủ yếu ở review layer.
- Một learning session = một ChatGPT conversation đang active.
- Không có EnPal backend.
- Không có Observer LLM service.
- Không parse/scrape prose của ChatGPT assistant để làm machine output.

V1 hỗ trợ **desktop Chrome + ChatGPT Web + các file Google Workspace đã cấu hình**. Runtime trên mobile/iPhone/iPad nằm ngoài V1.

Mô hình command bình thường dành cho learner là:

```text
START
PAUSE
END
```

Action retry/recover chỉ xuất hiện khi hệ thống ở trạng thái lỗi có thể phục hồi. Learner không bao giờ tự gọi ANALYZE, UPDATE, Review Planner hay các phase nội bộ khác.

Các teaching prompt chi tiết, rubric và rule riêng theo skill vẫn là các artifact được version hóa độc lập.

### Các runtime contract nằm ngoài file này

- START Skill
- PAUSE Skill
- END Skill
- ANALYZE Skill
- UPDATE Skill
- Review Planner Skill
- Supervisor Rubric
- Teacher Role Instructions
- Speaking Teaching Method
- Listening Teaching Method

Spec này là authority cho cách các artifact trên tương tác với nhau.

Trước khi implementation plan có thể được thực thi, các artifact trên phải được căn chỉnh với các contract trong spec này.

---

# 1. Kiến trúc

## 1.1 Phân chia trách nhiệm

### ChatGPT Web — giáo viên và semantic reasoning

ChatGPT chịu trách nhiệm:

- dạy lesson hiện tại;
- tuân theo Teacher Role + Teaching Method đúng với lesson;
- diễn giải Session Brief hiện tại;
- tạo semantic Pause Checkpoint;
- phân tích lesson đã hoàn thành;
- tạo durable ANALYZE result;
- áp dụng UPDATE lên Review Ledger;
- áp dụng Review Planner cho Base Lesson kế tiếp + Review Ledger hiện tại;
- chuẩn bị và ghi nội dung staging cho Session Brief kế tiếp.

Prose hiển thị của ChatGPT không bao giờ được Extension coi là kết quả transaction dành cho máy.

### Chrome Extension — orchestrator và verifier

Extension chịu trách nhiệm:

- điều phối lifecycle/state;
- điều hướng chính xác Project/chat;
- tạo/resume đúng conversation;
- gửi control instruction và các link đã được phê duyệt;
- Listening Mask theo kiểu preemptive;
- Voice START/STOP;
- START/STOP Supervisor;
- đọc/ghi deterministic state trong Google Sheets;
- xác minh durable commit marker;
- promote Session Brief;
- crash recovery;
- rename chat theo best-effort.

Extension không được tự suy luận semantic learner state từ conversation.

### Google Sheets — durable runtime truth

Google Sheets lưu toàn bộ authoritative runtime learning state.

Nếu local Extension state xung đột với committed Sheet state, Sheet state thắng.

### Google Drive / static reference documents

Google Drive có thể chứa các tài liệu instruction tĩnh như Teacher Role hoặc Teaching Methods.

Nó **không** được dùng như một runtime state store thứ hai.

### ChatGPT Project và Workspace Isolation

EnPal có thể quản lý nhiều learner Workspace.

Mỗi Workspace là một runtime boundary độc lập và sở hữu riêng:

- ChatGPT Project URL;
- Curriculum Sheet;
- EnPal Database Sheet;
- Session Brief Sheet;
- Review Ledger Sheet;
- các reference Teacher Role và Teaching Method;
- namespace Recovery Journal local;
- platform-verification marker.

Một Workspace không được dùng chung với Workspace khác cùng ChatGPT Project, Curriculum Sheet, Database Sheet, Session Brief Sheet hoặc Review Ledger Sheet.

Google OAuth authorization có thể dùng chung ở cấp extension/account, nhưng learning data và runtime state không bao giờ dùng chung giữa các Workspace.

Machine identity bên trong một Workspace dùng:

```text
workspace_id + session_id + exact chat_url
```

Chat title chỉ là human metadata.

Đổi Workspace chỉ thay active Workspace selector. Thao tác này không được mutate, copy, reset hoặc advance durable learning state của Workspace khác.

Workspace mới có thể được lưu local dưới trạng thái `DRAFT` chỉ với tên và ChatGPT Project URL. DRAFT chỉ là trạng thái cấu hình: EnPal không được tạo learner runtime, START lesson, hoặc fallback sang data source của Workspace khác/default Workspace cho tới khi Workspace đó có đầy đủ required runtime source riêng. Có thể nhập URL của một conversation nằm trong Project; EnPal chuẩn hóa URL đó về Project root trước khi lưu.

---

## 1.2 Ranh giới các runtime component

V1 sử dụng các component mang tính khái niệm sau:

### Workflow Orchestrator

Sở hữu deterministic state machine và quyết định phase hợp lệ tiếp theo.

Nó không chứa ChatGPT DOM selector và không chứa semantic learning logic.

### ChatGPT Adapter

Đây là component duy nhất được phép biết chi tiết UI của ChatGPT Web.

Nó sở hữu:

- điều hướng Project;
- tạo chat mới;
- mở chính xác chat;
- inject semantic control-message;
- gửi text bằng trusted browser input sau khi focus đúng composer theo semantic selector; không dùng direct editor-state mutation làm cơ chế correctness;
- xác nhận có thêm một user turn `ENPAL_CONTROL` sau khi gửi; không parse assistant prose để làm acknowledgement;
- xác nhận conversation URL thuộc đúng configured Project trước khi bind chat mới của START;
- idle detection;
- điều khiển Voice UI;
- rename behavior;
- hook realtime conversation feed.

Thay đổi DOM/UI của ChatGPT thông thường chỉ nên yêu cầu thay đổi trong adapter layer này.

### Google Sheets Client

Sở hữu:

- Extension OAuth access tới Google Sheets;
- các spreadsheet ID đã cấu hình chính xác;
- bounded reads;
- deterministic writes;
- commit verification;
- atomic promotion cho Session Brief.

### Recovery Journal

Dùng `chrome.storage.local`.

Recovery state được namespace theo `workspace_id`. Một Workspace chỉ được đọc, ghi hoặc clear recovery namespace của chính nó.

Lưu workflow intent và recoverable machine state, không lưu authoritative learning truth.

### Supervisor Controller

Sở hữu lifecycle của Supervisor, realtime feed filtering, delivery quyết định và degraded-mode status.

### Listening Mask Controller

Sở hữu preemptive masking và restore, tránh nhúng logic mask rải rác trong workflow engine.

### Side Panel UI

Chỉ hiển thị learner-facing state và các action hợp lệ.

Side Panel đồng thời sở hữu learner-facing Workspace selection và local Workspace configuration. Không được đổi Workspace khi Workspace hiện tại đang LEARNING hoặc PROCESSING. Có thể rời một Workspace đang PAUSED để học Workspace khác, nhưng không được sửa hoặc xóa cấu hình của Workspace đang pause.

---

## 1.3 Quy tắc thực thi với Manifest V3

Manifest V3 service worker được coi là ephemeral.

Tính đúng đắn không bao giờ được phụ thuộc vào:

- một service-worker function chạy dài trong memory;
- một timer dài;
- việc service worker sống liên tục trong suốt lesson hoặc END pipeline.

Mọi critical transition phải có thể được tái dựng từ:

```text
durable Sheet state
+
chrome.storage.local recovery journal
```

Workflow có thể tạm dừng khi không còn extension context nào sống, nhưng khi mở lại EnPal phải resume deterministic từ safe phase đầu tiên chưa hoàn thành.

---

## 1.4 Platform gate trước implementation

Trước khi full workflow engine được triển khai, production environment mục tiêu phải chứng minh được:

1. ChatGPT Project có thể mở/đọc mọi instruction/data file đã cấu hình cần cho START/RESUME.
2. ChatGPT có thể thực hiện các write cần thiết tới Google Sheets đã cấu hình từ đúng target Project.
3. Các routine write của EnPal không yêu cầu manual approval dialog ở mọi lesson transaction.
4. Extension OAuth có thể đọc/ghi các Google Sheet đã cấu hình.
5. Voice START/STOP và Listening Mask hoạt động trong cùng supported Chrome/ChatGPT environment.

Nếu bất kỳ gate nào fail, kiến trúc phải được xem lại. V1 không được fallback sang scrape assistant output.

---

## 1.5 Các non-goal rõ ràng của V1

V1 không bao gồm:

- backend/server;
- event sourcing;
- distributed transaction engine;
- generalized multi-user architecture;
- historical Session Brief archive;
- telemetry platform;
- tự động ingest podcast/YouTube bên ngoài;
- onboarding wizard phức tạp;
- admin dashboard trong learner runtime;
- dynamic rewriting của core curriculum;
- Project Control trong learner runtime.

---

# 2. Dữ liệu và Authority

## 2.1 Curriculum Sheet — nguồn curriculum canonical

V1 dùng **một Google Sheet riêng làm nguồn curriculum canonical**.

Nó được cấu hình bằng spreadsheet ID chính xác.

Mỗi Base Lesson là một curriculum record với stable identity như:

- `curriculum_version`;
- `curriculum_sequence`;
- `lesson_id`;
- các canonical lesson field cần cho shared logical lesson model.

Các column cụ thể là chi tiết của implementation plan.

Curriculum Sheet là fixed/read-mostly trong quá trình học bình thường.

Extension xác định Base Lesson kế tiếp từ:

```text
fixed curriculum sequence
+
durable completed Sessions
```

Base Lesson kế tiếp không bao giờ được ChatGPT tự do lựa chọn.

Các Base Lesson JSON cũ trên Drive chỉ là migration/reference artifact và không còn authoritative khi V1 được triển khai.

Mọi runtime curriculum access đều dùng đúng Curriculum Sheet ID đã cấu hình. Cấm runtime discovery bằng filename/title.

---

## 2.2 EnPal Database — Sessions và operational history

EnPal Database là operational Google Sheet bền vững.

Một Session record phải biểu diễn đủ thông tin cho:

- stable `session_id`;
- curriculum identity đã bind;
- lifecycle state;
- exact `chat_url` sau khi bind;
- completed lesson result;
- Pause Checkpoint khi có;
- durable ANALYZE result/completion;
- pipeline recovery marker;
- idempotency.

Spec này không khóa exact columns.

### One-active-session invariant

Trong normal learner operation, tối đa chỉ có một Session ở trạng thái non-terminal **trên mỗi Workspace**.

Các active lifecycle state tương đương có thể gồm:

```text
STARTING
IN_PROGRESS
PAUSED
PROCESSING
```

Nếu durable data của một Workspace chứa nhiều hơn một active Session, EnPal vào consistency error cho Workspace đó và không tự đoán Session nào cần dùng. Một PAUSED Session ở Workspace A không chặn normal operation ở Workspace B.

### Pause Checkpoint

Pause Checkpoint là semantic learning state mô tả:

- nội dung đã học;
- nội dung đang dở;
- nội dung còn lại;
- nên tiếp tục dạy từ đâu.

ChatGPT tạo và ghi checkpoint vào active Session.

Extension chỉ trigger và verify write đó.

### Authority của legacy data

Các legacy generalized Learner state, Target Bank, deprecated preparation area và old curriculum-position field không còn authoritative trừ khi được migrate rõ ràng vào contract của V1 này.

---

## 2.3 Session Brief Sheet

Session Brief là một Google Sheet riêng và chỉ chứa lesson đang ready/in progress.

Nó không phải historical store.

### Identity

Session Brief được nhận diện bằng curriculum identity, không dùng future Session ID:

```text
curriculum_version
+ curriculum_sequence
+ lesson_id
```

Session Brief kế tiếp được tạo trước khi `session_id` tiếp theo tồn tại.

Tại START, Session mới được tạo và bind với ACTIVE Session Brief identity đã verify.

### Canonical content

Brief dùng canonical logical lesson model và về mặt khái niệm gồm:

- Primary Skill;
- Communicative Goal;
- Focus;
- Situation/context;
- Target Performance;
- Completion Criteria;
- Mask Policy;
- lesson-flow information khi cần;
- Review Focus riêng với stable Review Item ID.

Primary Skill, Communicative Goal, Focus, Completion Criteria và Mask Policy là các field core curriculum cố định. Review Planner chỉ được thêm Review Focus và điều chỉnh tối thiểu Situation/Target Performance khi cần tạo cơ hội review tự nhiên.

Focus và Completion Criteria được lưu dưới dạng JSON array. Review Focus luôn là JSON array; array rỗng `[]` nghĩa là không có review item được chọn.

Review layer phải luôn phân biệt rõ với fixed core learning.

### ACTIVE + _STAGING

Session Brief Sheet có hai functional area/tab:

```text
ACTIVE
_STAGING
```

`ACTIVE` là brief duy nhất START/RESUME được phép dùng.

`_STAGING` là vùng xây dựng tạm thời, không phải lesson history.

Trong END:

1. ChatGPT ghi toàn bộ brief kế tiếp vào `_STAGING`.
2. Extension verify toàn bộ required key, curriculum identity, ready marker, các field JSON array, enum Primary Skill và enum Mask Policy.
3. Extension promote `_STAGING` sang `ACTIVE` bằng một atomic Google Sheets batch update.
4. Cùng promotion đó clear/reset staging.
5. Nếu promotion fail, ACTIVE brief trước đó vẫn là authority.

Cơ chế này giữ invariant rằng brief mới đang ghi dở không bao giờ phá current valid brief.

Trong PAUSE, ACTIVE không thay đổi.

---

## 2.4 Review Ledger

Review Ledger là long-term personalization/review state duy nhất.

Review Planner chỉ đọc nó sau khi UPDATE đã hoàn tất bền vững và được verify.

V1 không duy trì một generalized Target Bank song song.

---

## 2.5 Local recovery journal

`chrome.storage.local` có thể chứa:

- app/workflow state;
- current phase;
- active `session_id`;
- bound/pending `chat_url`;
- pending ChatGPT `tab_id`;
- pending operation;
- machine error code.

Nó không phải authoritative learning state.

Authentication token không được lưu như ordinary recovery-journal value.

---

# 3. Setup và Authentication

## 3.1 App setup state

Trước READY, EnPal có thể ở:

```text
SETUP_REQUIRED
```

Setup phải thiết lập:

- ChatGPT Project ID/URL;
- Curriculum Sheet ID;
- EnPal Database ID;
- Session Brief Sheet ID;
- Review Ledger ID;
- Teacher Role URL;
- Speaking Teaching Method URL;
- Listening Teaching Method URL;
- Extension Google authorization;
- verified ChatGPT Google access/write capability;
- ACTIVE Session Brief đầu tiên.

Sau khi setup/bootstrap thành công:

```text
SETUP_REQUIRED → READY
```

Không cần onboarding wizard phức tạp.

---

## 3.2 Extension Google OAuth

Extension dùng Chrome Identity OAuth để truy cập Google Sheets.

Kiến trúc V1 giả định:

- `chrome.identity.getAuthToken()`;
- cấu hình `oauth2` client/scopes rõ ràng trong `manifest.json`;
- Sheets scopes chỉ giới hạn ở những gì V1 thật sự cần;
- interactive authorization được khởi động bởi một user action có giải thích trong setup;
- runtime token retrieval bình thường là non-interactive;
- token dựa vào cache của Identity API thay vì copy vào `chrome.storage.local`.

Extension không cần Google Drive API access chỉ để đọc Teacher Role/Teaching Method; ChatGPT đọc các configured reference link đó.

---

## 3.3 Exact-source allowlist và trust hierarchy

Production configuration là một allowlist gồm exact Project/file ID hoặc URL.

EnPal không được chấp nhận arbitrary Drive/Sheet link từ:

- assistant output;
- page content;
- learner text;
- retrieved learning data.

Trust order:

1. **Control sources** — Teacher Role, Teaching Method, Skill/control instruction đã được phê duyệt.
2. **Learning-data sources** — Curriculum, Session Brief, Review Ledger, Session record.
3. **Conversation content** — tương tác learner/teacher.

Text trong learning-data được xử lý như data và không được override control instruction ở tầng ưu tiên cao hơn.

---

# 4. START

START tự động chọn giữa recovery, resume và new session.

Verify setup và việc khởi tạo Side Panel là các observational boundary: chúng có thể validate configuration và đọc durable state, nhưng không được mở ChatGPT, gửi control message, start Voice hoặc thực thi recovery. Recovery có side effect trên ChatGPT chỉ được chạy sau thao tác START hoặc Retry rõ ràng của learner.

Thứ tự ưu tiên:

1. incomplete recoverable pipeline;
2. existing PAUSED session;
3. new ACTIVE Session Brief.

---

## 4.1 Required teaching context

Trước khi Voice bắt đầu, Extension gửi các approved link/instruction riêng cho:

- Teacher Role;
- Teaching Method đúng với Primary Skill;
- ACTIVE Session Brief.

Khi RESUME, Extension additionally yêu cầu ChatGPT đọc Pause Checkpoint từ active Session record.

Extension đợi ChatGPT trở về idle; không parse assistant prose.

Idle chỉ là V1 readiness heuristic. Khả năng truy cập file thật được chứng minh qua setup/E2E gate.

---

## 4.2 New session flow

Với new session:

1. Verify không có active Session khác.
2. Đọc và verify ACTIVE Session Brief identity.
3. Xác định Brief này chính là deterministic next curriculum lesson.
4. Tạo một Session stub với stable `session_id`, bound lesson identity và status `STARTING`.
5. Ghi pending start state vào local journal.
6. Mở configured ChatGPT Project trong một EnPal-owned tab và ghi `tab_id`.
7. Tạo conversation mới.
8. Với protected Listening, arm Listening Mask trước khi bất kỳ control message nào có thể làm lộ protected content.
9. Gửi required teaching-context link/instruction bằng trusted browser input và xác nhận đã xuất hiện user turn `ENPAL_CONTROL` mới.
10. Chờ và capture exact conversation URL nằm trong đúng configured Project; chat global hoặc chat của Project khác phải fail closed.
11. Persist `session_id + chat_url` một cách bền vững và verify.
12. Mark Session thành `IN_PROGRESS`.
13. Start Supervisor; nếu fail áp dụng degraded-mode policy ở Section 7.
14. Start Voice.
15. App state thành LEARNING.

START không chạy Review Planner.

---

## 4.3 Recovery khi crash trong chat creation

V1 bảo đảm **một authoritative active chat binding**, không bảo đảm exactly-once physical chat creation tuyệt đối trên website ChatGPT bên ngoài.

### Trước durable chat_url binding

Nếu EnPal restart khi Session đang `STARTING` và chưa có committed `chat_url`:

1. Đọc local pending `tab_id`.
2. Nếu EnPal-owned tab đó vẫn tồn tại và ChatGPT Adapter có thể xác nhận an toàn rằng đó là pending Project conversation, capture và persist URL.
3. Nếu không, không được đoán.
4. Tạo replacement conversation bằng **cùng `session_id` và cùng lesson identity**.
5. Chỉ bind conversation URL đầu tiên được verify an toàn vào Session.

Một unbound conversation trước đó có thể còn lại thành orphan ChatGPT chat.

Orphan đó không phải EnPal Session và không bao giờ được advance curriculum hay nhận END processing.

### Sau durable chat_url binding

Khi Session đã có verified `chat_url`, mọi retry/resume đều reuse exact URL đó và không được tạo conversation khác.

V1 invariant là:

```text
one logical Session
→ one authoritative bound chat_url
```

thay vì hứa một điều không thể triển khai là external orphan chat tuyệt đối không bao giờ tồn tại.

---

## 4.4 Resume sau PAUSE

RESUME:

1. Mở exact saved `chat_url`.
2. Verify URL khớp active Session.
3. Verify ACTIVE Session Brief identity khớp bound lesson của Session.
4. Re-arm Listening Mask trước control message khi cần.
5. Gửi Teacher Role + đúng Teaching Method + ACTIVE Session Brief.
6. Gửi checkpoint read/restore instruction.
7. Đợi ChatGPT idle.
8. Start Supervisor nếu available.
9. Start Voice.
10. Mark Session IN_PROGRESS / app LEARNING.

Không tạo chat mới.

---

# 5. PAUSE

PAUSE:

1. Verify active `session_id + chat_url`.
2. Stop Voice.
3. Stop Supervisor.
4. Giữ Listening Mask protection nếu cần.
5. Gửi PAUSE control vào cùng conversation.
6. ChatGPT tạo và ghi semantic Pause Checkpoint vào active Session.
7. Extension verify checkpoint + PAUSED durable state.
8. ACTIVE Session Brief không thay đổi.
9. Local journal ghi recoverable state.

PAUSE không:

- phân tích final performance;
- update Review Ledger;
- advance curriculum;
- tạo Session mới;
- thay Session Brief;
- rename chat.

Nếu checkpoint persistence không được verify, EnPal vào recoverable ERROR thay vì giả vờ rằng pause đã an toàn.

---

# 6. END

END thực hiện post-learning work trong cùng bound ChatGPT conversation.

Canonical order:

```text
END
→ stop Voice
→ stop Supervisor
→ ANALYZE
→ persist + verify ANALYZE
→ UPDATE Review Ledger
→ verify UPDATE
→ determine next Base Lesson
→ Review Planner
→ write next Brief to _STAGING
→ verify staging
→ atomically promote to ACTIVE
→ mark current Session COMPLETED
→ best-effort rename
→ READY
```

Mỗi phase có durable boundary có thể verify độc lập.

---

## 6.1 ANALYZE

ANALYZE chỉ đánh giá pedagogical lesson evidence.

ChatGPT ghi required ANALYZE result/completion vào active Session record.

Extension verify durable boundary trước UPDATE.

---

## 6.2 UPDATE

UPDATE tiêu thụ verified ANALYZE evidence và áp dụng approved Review Ledger transition rule.

Review Planner không được chạy cho tới khi Review Ledger write được verify.

---

## 6.3 Review Planner

Review Planner chỉ nhận:

1. deterministic next Base Lesson từ Curriculum Sheet;
2. current verified Review Ledger.

Completed-session evidence đi tới Planner một cách gián tiếp qua UPDATE.

Planner có thể thêm Review Focus và điều chỉnh tối thiểu Situation/Target Performance, nhưng không được thay đổi Primary Skill, Communicative Goal, Focus, Completion Criteria hoặc Mask Policy.

---

## 6.4 Tạo Session Brief

ChatGPT ghi toàn bộ brief kế tiếp vào `_STAGING`.

Extension validate toàn bộ required key, machine-checkable field type/enum, ready marker và identity; không parse assistant prose hay tự thực hiện semantic lesson design.

Sau khi verify, Extension atomically promote staging thành ACTIVE.

Chỉ sau đó current Session mới được phép trở thành COMPLETED.

---

## 6.5 Rename

Rename là:

- sau core completion;
- best effort;
- rate-limit aware;
- non-blocking.

Rename failure không bao giờ đưa learning state quay lại ERROR.

---

# 7. Supervisor

Supervisor là một **quality guardrail**, không phải correctness-critical dependency.

Lifecycle:

```text
START / RESUME → attempt Supervisor ON
PAUSE / END    → Supervisor OFF
```

Supervisor nhận:

- ACTIVE Session Brief;
- đúng Teaching Method;
- filtered realtime conversation feed.

Nó có thể trả về:

- `CONTINUE`;
- `NUDGE`;
- `CORRECT_COURSE`.

NUDGE/CORRECT_COURSE mang một short actionable instruction tới active Teacher conversation.

Supervisor không được:

- đổi Base Lesson;
- đổi Communicative Goal;
- advance curriculum;
- mutate durable learning state.

## 7.1 Supervisor failure policy — fail open

Nếu Supervisor không initialize được hoặc fail giữa lesson:

- lesson vẫn có thể tiếp tục;
- Teacher Role + Teaching Method + Session Brief vẫn là authority;
- Voice không dừng chỉ vì Supervisor fail;
- không tạo fake Supervisor decision;
- Supervisor status được ghi là degraded/unavailable;
- END/ANALYZE vẫn chạy bình thường.

Supervisor chỉ retry qua các lifecycle opportunity bình thường như RESUME/new START; V1 không cần complex self-healing loop.

---

# 8. Listening Mask

Với lesson yêu cầu protected Listening:

- mask phải được arm **trước** bất kỳ control message nào có thể render protected content;
- mask giữ hiệu lực trong protected learning interval;
- PAUSE không được làm lộ protected content;
- các control cần để vận hành Voice/EnPal vẫn phải dùng được;
- fail khi arm required mask là fail-closed.

Listening Mask behavior được cô lập trong controller/adapter thay vì trộn vào lesson reasoning.

---

# 9. Ranh giới Control-Message và Evidence

Cùng một ChatGPT conversation chứa cả learning interaction lẫn EnPal control traffic.

Vì vậy mọi administrative message do EnPal tạo phải có reserved internal classification như:

```text
ENPAL_CONTROL
```

kèm control type/session identity trong envelope.

Ví dụ gồm:

- START/RESUME setup instruction;
- PAUSE command;
- Supervisor instruction;
- END/ANALYZE/UPDATE/Planner command.

Các message này:

- không phải learner evidence;
- bản thân chúng không phải teacher-performance evidence;
- bị loại khỏi Supervisor pedagogical feed;
- bị loại khỏi ANALYZE evidence.

Teacher/learner turn sinh ra từ tương tác học thật vẫn là pedagogical evidence.

Exact wire syntax được định nghĩa trong control-message contract, nhưng classification phải deterministic và không được dựa vào natural-language guessing.

---

# 10. Recovery và Failure Policy

Quy tắc trung tâm:

> Local state ghi EnPal đang cố làm gì. Google Sheets ghi điều gì đã thực sự xảy ra một cách bền vững.

Khi restart/reopen:

1. đọc local recovery journal;
2. đọc relevant durable Sheets;
3. validate one-active-session invariant;
4. reconcile theo Session identity và phase;
5. tiếp tục từ incomplete safe phase đầu tiên.

Phase đã commit không bao giờ được lặp lại chỉ vì local state bị stale.

---

## 10.1 Required durable boundaries

Recovery ít nhất phải phân biệt được:

- Session stub đã tạo;
- authoritative chat URL đã bind;
- PAUSE checkpoint đã commit;
- ANALYZE đã commit;
- UPDATE đã commit;
- Session Brief staging đã verify/promote;
- Session đã COMPLETED.

Exact field/marker name là implementation detail.

---

## 10.2 Fail-closed và fail-open

### Fail closed

Không start/continue affected phase khi:

- required Sheet/reference source không truy cập được;
- required durable write không verify được;
- active chat identity sai/unknown;
- tồn tại nhiều active Session;
- required Listening Mask không arm được;
- Session Brief identity không khớp expected curriculum/session binding;
- thiếu required setup/platform capability.

### Fail open

Core lesson/session vẫn có thể tiếp tục khi:

- Supervisor fail;
- chat rename fail.

---

## 10.3 UI/Voice failure

Voice start failure:

- giữ nguyên Session/chat binding;
- không tạo chat khác;
- hiển thị retry.

Voice stop failure:

- không bắt đầu ANALYZE cho tới khi confirmed stopped.

Nếu ChatGPT Adapter không tìm được required semantic UI, nó trả structured failure và không tiếp tục click mù.

---

# 11. App State và Learner UX

Learner-facing app state:

```text
SETUP_REQUIRED
READY
LEARNING
PAUSED
PROCESSING
ERROR
```

PROCESSING khóa các learner action xung đột.

Trong PROCESSING learner không được START lesson khác hoặc PAUSE lesson đã kết thúc.

Learner-facing error dùng ngôn ngữ đơn giản, ví dụ:

- “Không lưu được tiến độ — Thử lại”
- “Đang hoàn tất buổi học trước”
- “Đang tiếp tục buổi học đã tạm dừng”

Các internal term như ANALYZE, UPDATE, Review Planner, pipeline phase hoặc OAuth error code không cần hiển thị cho learner.

---

# 12. Security, Privacy và Permissions

## 12.1 Data flow

V1 không có EnPal backend.

Toàn bộ learning conversation nằm trong ChatGPT.

Google Sheets có thể lưu:

- Session metadata/status;
- learning summary/evidence theo contract;
- Pause Checkpoint;
- Review Ledger;
- Session Brief;
- fixed Curriculum.

Diagnostic/recovery state nên chỉ lưu machine metadata, không lưu full transcript.

---

## 12.2 Permission minimization

Chỉ request những permission/host cần cho behavior V1 đã implement.

Permission `debugger` hiện có chỉ được giữ nếu verified trusted Voice-control mechanism vẫn thật sự cần nó.

Nếu giữ:

- isolate nó phía sau Voice/ChatGPT Adapter behavior;
- chỉ attach vào exact active ChatGPT tab khi cần;
- detach ngay sau trusted activation sequence;
- không dùng nó như general scraping/inspection mechanism.

Loại bỏ Google host permission không cần thiết trước release.

---

## 12.3 Không có arbitrary external control

Chỉ configured allowlisted control/data source mới được gửi như authoritative EnPal link.

Assistant-generated URL không bao giờ tự động được promote thành trusted configuration.

---

# 13. Testing và Acceptance

V1 cần ba test layer:

1. **Unit tests** — workflow transition, recovery decision, identity rule.
2. **Adapter/contract tests với fake** — Sheets, ChatGPT Adapter, mask, Supervisor controller.
3. **Live E2E smoke tests** — target ChatGPT Web + Google environment thật.

Các test hiện tại của extension shell chưa đủ cho V1 acceptance.

---

## 13.1 Mandatory crash-window matrix

Verify deterministic recovery sau interruption ít nhất tại:

1. Session stub đã tạo, trước chat creation.
2. Chat đã tạo, trước khi persist `chat_url`.
3. `chat_url` đã persist, trước khi Voice start.
4. Pause Checkpoint đã commit, trước khi PAUSE trả về.
5. ANALYZE đã commit, trước UPDATE.
6. UPDATE đã commit, trước Review Planner.
7. `_STAGING` đã ghi/verify, trước ACTIVE promotion.
8. ACTIVE đã promote, trước current Session COMPLETED.
9. Session COMPLETED, trước rename.

Expected result là không duplicate logical Session, không duplicate Review Ledger transition và không double curriculum advancement.

Unbound orphan external chat chỉ được chấp nhận ở case 2 và không bao giờ tự động trở thành active EnPal Session.

---

## 13.2 V1 end-to-end acceptance gate

V1 chỉ được coi là complete khi production-like environment chứng minh:

1. Setup đạt READY bằng exact configured source.
2. Extension OAuth đọc/ghi mọi required Sheet.
3. ChatGPT đọc required reference file và thực hiện required durable write trong target Project mà không cần per-lesson manual approval.
4. Curriculum selection deterministic từ Curriculum Sheet + completed Sessions.
5. New START tạo một Session và một authoritative bound chat.
6. Protected Listening không bao giờ flash protected content trước khi mask protection hoạt động.
7. PAUSE ghi bền vững một semantic checkpoint dùng được.
8. RESUME dùng exact bound chat và tiếp tục từ checkpoint.
9. Supervisor failure không block một lesson hợp lệ.
10. ENPAL_CONTROL message không làm bẩn Supervisor/ANALYZE evidence.
11. Thứ tự ANALYZE → UPDATE → Review Planner là durable và recoverable.
12. Session Brief mới được stage, verify và atomically promote mà không làm hỏng ACTIVE.
13. Curriculum advance đúng một lần cho mỗi completed Session.
14. Restart/reload tại mọi crash-window case đều recover deterministic.
15. Rename failure không block READY.
16. Không production workflow nào phụ thuộc vào việc parse ChatGPT assistant prose.

---

# 14. Căn chỉnh Contract trước Implementation

Trước khi implementation bắt đầu, cập nhật các runtime artifact riêng để chúng khớp spec này:

- START: Curriculum/Brief identity, mandatory read set, preemptive mask, chat-binding rule.
- PAUSE: ChatGPT semantic checkpoint write; Extension verify.
- END: durable ANALYZE/UPDATE/Planner/staging/promotion order.
- Review Planner: chính xác Base Lesson + verified Review Ledger làm input.
- ANALYZE: ignore ENPAL_CONTROL traffic và chỉ dùng lesson evidence.
- Supervisor: ignore ENPAL_CONTROL traffic và support degraded mode.
- Session Brief contract: canonical lesson model + stable Review Item ID.
- Runtime configuration: exact allowlisted ID/URL.
- Legacy Drive Base Lesson JSON / Target Bank / deprecated preparation assumption: non-authoritative.

Phần căn chỉnh này là documentation/contract work, không phải runtime subsystem mới.

---

# 15. Canonical V1 Invariants

Mọi implementation choice phải giữ các invariant sau:

1. ChatGPT = semantic teaching/reasoning.
2. Extension = deterministic orchestration/verification.
3. Sheets = durable runtime truth.
4. Local storage = recovery journal.
5. Curriculum Sheet = canonical fixed Base Lesson source.
6. Mỗi thời điểm chỉ có một active logical Session.
7. Một Session = một authoritative bound `chat_url`.
8. External orphan chat chỉ có thể tồn tại khi chat creation crash trước durable binding.
9. Session Brief ACTIVE chỉ chứa current/ready lesson.
10. `_STAGING` là temporary, không phải history.
11. Session Brief identity là curriculum identity; Session ID được bind tại START.
12. Review Ledger là long-term review personalization state duy nhất.
13. Review Planner không được thay đổi core curriculum lesson.
14. Required Listening Mask failure là fail-closed.
15. Supervisor failure là fail-open.
16. Rename failure là fail-open.
17. Control message được classify và loại khỏi pedagogical evidence.
18. Runtime source là exact allowlisted ID/URL.
19. Core correctness không phụ thuộc MV3 service-worker lifetime.
20. Không scrape assistant output.
21. Không thêm backend hay architectural subsystem mới nếu chưa có nhu cầu V1 được chứng minh.

Bất kỳ thay đổi tương lai nào phá một trong các invariant này đều là architectural change và phải update spec trước.
