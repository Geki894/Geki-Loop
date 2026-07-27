# Geki Loop

Geki là bộ workflow skill cài cục bộ theo từng project cho Codex và Google Antigravity. Planning luôn tương tác với người dùng; chỉ khi người dùng chủ động gọi `geki-run` với scope rõ ràng thì vòng coding tự động mới bắt đầu.

## Cài đặt

Phiên bản `0.3.0` chưa được publish lên npm. Chạy trực tiếp từ repository public:

```powershell
npx --yes "github:Geki894/Geki-Loop#main" install
```

Cập nhật Geki trong một project đã cài:

```powershell
npx --yes "github:Geki894/Geki-Loop#main" add --yes
npx --yes "github:Geki894/Geki-Loop#main" doctor
```

`npx` tải và chạy package mà không cần cài global. Geki dùng `npx` để đưa skill/runtime vào chính project; nó không cài một bộ workflow dùng chung cho toàn máy.

Khi phát triển từ package local:

```powershell
npm pack
npx .\geki-0.3.0.tgz install
```

## Planning thích ứng theo quy mô

Geki hỗ trợ bốn profile:

- `course-demo`: bài tập, prototype, hackathon hoặc deadline tính bằng ngày.
- `startup-mvp`: sản phẩm thật của nhóm nhỏ, cần ra thị trường sớm.
- `institutional-production`: nhiều stakeholder, compliance, dữ liệu nhạy cảm hoặc yêu cầu vận hành production.
- `custom`: chính sách planning do người dùng chốt.

Profile chỉ điều chỉnh độ sâu tài liệu và scope guardrail. Nó không tự chọn framework, ORM, authentication hoặc deployment, và không làm yếu các cổng build, test, review hay GitHub.

## Luồng chính

```text
geki-spec
  -> đề xuất và xác nhận delivery profile
  -> discovery theo batch
  -> bộ Product/UX artifact thích ứng
  -> Architecture: required-now và future-hardening
  -> static validator
  -> một baseline review và một delta closure
  -> chọn current-delivery
  -> elaborate 1–3 Story Contract sắp chạy
  -> geki-readiness cho scope đã chọn
  -> đề xuất module sync

geki-run stories 1.1,1.2,1.3
  -> người dùng chủ động bắt đầu loop
  -> code, build, independent review và toàn bộ test cần thiết
  -> GitHub Actions
  -> tự merge Epic PR vào coding khi mọi gate đều đạt
```

Full backlog được giữ ở mức capability hoặc Story title trong hai lane `next` và `future`. Chỉ `current-delivery` mới có contract thực thi; vì vậy Geki không sinh hàng chục Markdown/YAML trước khi Story đầu tiên được code.

## Trạng thái bền vững

`geki-help` đọc:

- Delivery profile và planning stage.
- Artifact đã draft/review/approved.
- Review checkpoint và số vòng hiện tại.
- Current delivery slice.
- Pending decisions.
- Execution state và evidence.

Nhờ vậy có thể chuyển giữa Codex và Antigravity mà không phụ thuộc lịch sử chat.

Dashboard chỉ đọc dữ liệu và hiển thị tiến độ; nó không điều khiển agent hoặc tự thay đổi workflow.

## Nguyên tắc kỹ thuật

- .NET greenfield mặc định `net8.0` và ASP.NET Core Web API nếu spec không yêu cầu khác.
- NestJS greenfield mặc định Prisma + PostgreSQL khi Architecture không chứng minh lựa chọn khác phù hợp hơn.
- Không tự thêm Repository, Unit of Work, Mediator, CQRS hoặc abstraction không tạo giá trị.
- Baseline authorization, data integrity, migration safety và failure semantics không bị loại bỏ chỉ vì project nhỏ.
- Test dùng database/API sandbox thật khi có thể; email thật chỉ gửi tới allowlist.
- Không tự merge vào `main`, không tự deploy production và không thu telemetry.
- Một review checkpoint mặc định chỉ có baseline và delta closure. Vòng ba chỉ hợp lệ khi vẫn còn Critical/High.
- Epic chỉ hoàn tất khi mọi Story trong scope đã tích hợp và GitHub required checks đều pass.
