# Huớng dẫn

1. **Tải file [AIC_2026.ipynb](kaggle/AIC_2026.ipynb), xong mở [Kaggle](https://www.kaggle.com/)**

    - Tạo Notebook
    - Nhấn `File`
    - `Import Notebook`
    - Chọn file vừa tải

2. **Download 2 datasets này rồi bấm `Add Input`, thêm 2 datasets này:**
   - [verse91/json-npy](https://www.kaggle.com/datasets/verse91/json-npy) - feature BGE-M3
   -  [huhongnguyn111/dataset-aic](https://www.kaggle.com/datasets/huhongnguyn111/dataset-aic) (clip-features, map-keyframes, Keyframes, Videos)
3. Thêm các secret keys cần thiết (`Add-ons` > `Secrets`)
   - `GOOGLE_API_KEY` - cho LLM tách prompt
   - `CF_TUNNEL_TOKEN` - cho hostname cố định
4. Panel phải, ở phần `Session options`:
 - **Accelerator: GPU T4 x2**
 - **Internet: On** (để `pip install`)

> [!IMPORTANT]
> Khi test nên báo với nhau để chắc chắn không có lỗi xảy ra  
> Mỗi người dùng quota GPU của chính mình - **30h/tuần mỗi tài khoản**

---

## 🔴 Mỗi lần chạy: RUN ALL TRONG EDITOR, KHÔNG BẤM SAVE VERSION

| Cách chạy                            | Tunnel                             |
| ------------------------------------ | ---------------------------------- |
| **Run All trong Editor**, giữ tab mở | ✅ sống tới khi bấm Stop            |
| **Save Version** (batch)             | ❌ chết ngay khi notebook chạy xong |

Save Version chạy notebook trong container batch rồi **tắt container**. Tunnel chết theo,
`aic.verse.id.vn` trả `error code 1033`. Nó chỉ dùng để đóng băng dữ liệu thành dataset,
không dùng để chạy service.

Chờ tới khi thấy:

```
✅ Tunnel đã kết nối.
  URL CỐ ĐỊNH:  https://aic.verse.id.vn
```

Rồi mở web. Xong việc thì **Stop session** cho đỡ tốn quota.

Giới hạn phiên: tối đa 12 tiếng, idle timeout 20–60 phút nếu không thao tác.

---

## Cấu trúc notebook

| Cell | Việc                                         | Bắt buộc?        |
| ---- | -------------------------------------------- | ---------------- |
| 1–5  | search (code gốc `searcher.py`)              | ✅                |
| 6–8  | API + tunnel → `aic.verse.id.vn`             | chỉ khi dùng web |
| 9–10 | xuất `aic-workspace.json` + `submission.zip` | khi nộp bài      |

Chỉ cần search trong notebook thì chạy 1–5 rồi dừng.

---

## Web

```bash
cd web && bun install && bun run dev     # http://localhost:5173
```

Nút trạng thái góc trên trái phải **xanh**. Còn đỏ thì backend chưa chạy -
bấm vào nó để đổi Backend URL nếu đang dùng quick tunnel.

---

## ⚠️ Chia việc: state KHÔNG dùng chung

Kết quả lọc tay sống trong **localStorage của trình duyệt**, không nằm trên Kaggle.

- ✅ Session Kaggle chết → không mất công sức lọc
- ❌ **Hai người lọc trên hai máy KHÔNG thấy việc của nhau**

Cách an toàn cho vòng thi 3 tiếng: **mỗi người phụ trách một nhóm query riêng**, cuối
cùng gộp file. Dùng nút **Lưu workspace** / **Nạp** để trao đổi file JSON.

Muốn sửa chung theo thời gian thực thì cần backend có trạng thái dùng chung - thứ mà
kiến trúc 0đ này cố tình không có.

---

## Luật nộp bài dễ quên nhất

**Mỗi gói chỉ được nộp 3 lần, và tính LẦN CUỐI CÙNG - không phải lần tốt nhất.**

Nộp thêm một bản tệ hơn là **ghi đè** bản tốt. Nộp sai định dạng vẫn tính 1 lần.
Cân nhắc kỹ trước mỗi lần bấm nộp.
