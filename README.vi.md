# Geki Loop

Geki là bộ workflow skill cài cục bộ theo từng project cho Codex và Google Antigravity. Giai đoạn đặc tả luôn tương tác với người dùng; chỉ lệnh `geki-run` mới bắt đầu vòng lặp coding tự động.

## Cài đặt

```powershell
npx geki@latest install
```

Phiên bản `0.1.0` chưa publish lên npm. Sau khi repository public, có thể chạy trực tiếp:

```powershell
npx github:Geki894/Geki-Loop install
```

`npx` tải/chạy lệnh của package mà không cần cài global; `npm install` thêm dependency vào project. Geki dùng `npx` cho lần cài vào project. Trong màn hình chọn, dùng phím mũi tên để di chuyển, Space để bật/tắt module và Enter để tiếp tục.

Khi phát triển từ package local:

```powershell
npm pack
npx .\geki-0.1.0.tgz install
```

## Luồng chính

```text
geki-spec
  -> BRD/PRD/UX/Architecture
  -> Spec Council phản biện độc lập
  -> geki-readiness
  -> đề xuất module theo Architecture đã duyệt

geki-run epic 1,2,3
  -> người dùng chủ động bắt đầu loop
  -> code, build, review, test, GitHub Actions
  -> tự merge Epic PR vào coding khi mọi gate đều đạt
```

`geki-help` đọc trạng thái bền vững trong repository và chỉ ra phase hiện tại cùng hành động an toàn tiếp theo. Nhờ vậy có thể chuyển từ Codex sang Antigravity mà không phụ thuộc lịch sử chat.

Trước lần chạy execution đầu tiên, cần bảo vệ hai nhánh `coding` và `main` trên GitHub, đồng thời đặt workflow chất lượng của Geki thành required check. GitHub CLI (`gh`) phải được đăng nhập để tự động hóa Epic PR; sau khi module GitHub được đồng bộ, `geki doctor` sẽ kiểm tra điều kiện này.

Trong Codex chat dùng `$geki-help`, `$geki-spec`, hoặc `$geki-run` kèm scope rõ ràng. Trong Antigravity dùng `/geki-help` hay `/geki-run epic 1,2,3`. Đây là workflow trong ô chat của agent, không phải lệnh terminal.

## Nguyên tắc

- .NET greenfield mặc định `net8.0` và ASP.NET Core Web API nếu spec không yêu cầu khác.
- NestJS greenfield mặc định Prisma + PostgreSQL khi Architecture không chứng minh lựa chọn khác phù hợp hơn.
- Không tự thêm Repository, Unit of Work, Mediator, CQRS hoặc abstraction không tạo giá trị.
- Test dùng database/API sandbox thật khi có thể; email thật chỉ gửi tới allowlist.
- Không tự merge vào `main`, không tự deploy production và không thu telemetry.
- Evidence, số lần sửa và hash contract được tách riêng theo từng Story; Epic chỉ hoàn tất khi mọi Story đã được tích hợp và GitHub required checks đều pass.
