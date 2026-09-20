# EnPal Project Control Dashboard V1

Dashboard Project Control chỉ đọc cho EnPal V1.

## Quy tắc cập nhật tiến độ

Khi implementation hoàn thành một bước trong `docs/superpowers/plans/2026-09-20-enpal-v1-implementation-plan.md`, đổi checkbox của bước đó từ:

```markdown
- [ ] Step
```

thành:

```markdown
- [x] Step
```

trong **cùng commit với thay đổi implementation tương ứng**.

Dashboard tự đọc Implementation Plan từ GitHub và tính lại tiến độ. Không chỉnh trạng thái task trực tiếp trong HTML/JavaScript và không tạo database Project Control thứ hai.

Để ghi blocker cho một task, thêm marker trong section task đó:

```markdown
<!-- ENPAL_BLOCKED: lý do -->
```

## Preview local

Từ root của repo:

```bash
python3 -m http.server 8000 --directory docs/project-control
```

Mở:

```text
http://localhost:8000
```

Lưu ý: dashboard cần Internet để đọc dữ liệu GitHub public. Khi network lỗi sau một lần tải thành công, UI giữ trạng thái cuối trong memory của page và hiển thị cảnh báo.

## Hosting

Các file trong thư mục này sẵn sàng để host bằng GitHub Pages. Project Control không phải dependency của EnPal learner runtime.
