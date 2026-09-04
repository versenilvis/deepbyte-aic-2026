<img src="https://github.com/user-attachments/assets/044d4910-9013-47cf-995c-e0ace59bcd51" width="1080" alt="Login Screen" />
<img width="2560" height="1600" alt="image" src="https://github.com/user-attachments/assets/31c83213-3e32-4373-b456-358a3a391477" />

<table>
  <tr>
    <td width="50%">
      <img src="https://github.com/user-attachments/assets/429266ef-82cf-498b-8c96-8403e865d1d7" width="100%" alt="Home Screen 1" />
    </td>
    <td width="50%">
      <img src="https://github.com/user-attachments/assets/69b595a6-c712-4c03-b2c8-4d1b320840b4" width="100%" alt="Login Screen" />
    </td>
  </tr>
</table>

# HCMAIC-2026
- Tên hội thi: Hội thi Thử thách Trí tuệ Nhân tạo (AI Challenge) Thành phố Hồ Chí Minh năm 2026.
- Team: Deepbyte
- Bảng A

## Huớng dẫn

1. **Tải file [AIC_2026.ipynb](kaggle/AIC_2026.ipynb), xong mở [Kaggle](https://www.kaggle.com/)**

    - Tạo Notebook
    - Nhấn `File`
    - `Import Notebook`
    - Chọn file vừa tải

2. **Download 2 datasets này rồi bấm `Add Input`, thêm 2 datasets này:**
   - [cbg6682/npy-json](https://www.kaggle.com/datasets/cbg6682/npy-json) - feature BGE-M3
   -  [huhongnguyn111/dataset-aic](https://www.kaggle.com/datasets/huhongnguyn111/dataset-aic) (clip-features, map-keyframes, Keyframes, Videos)
3. Thêm các secret keys cần thiết (`Add-ons` > `Secrets`)
   - `GOOGLE_API_KEY` - cho LLM tách prompt
   - `CF_TUNNEL_TOKEN` - cho hostname cố định

> [!IMPORTANT]
> Phần `CF_TUNNEL_TOKEN` hãy tìm theo từ khoá "hướng dẫn tạo Cloudflare Tunnel Zero Trust", có thể nhờ AI hướng dẫn cho để setup vì nếu viết ra hướng dẫn tạo key này sẽ rất dài dòng
  
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

## Web

```bash
cd web && bun install && bun run dev     # http://localhost:5173
```

---

## Nộp bài
Các thành viên sử dụng nút chia sẻ, và nộp lên phần subdomain tương ứng của mình, nhóm trưởng gom kết quả về, kiểm tra và nộp

> [!WARING]
> Dự án không có license, nếu bạn clone về thì tự quản lí, mình không chịu trách nhiệm nào và cũng sẽ không giải đáp bất cứ thấc mắc nào  
> Key và domain trong dự án này sẽ xoá sau khi kết thúc nên sẽ không còn dùng được, bạn hãy tự sửa lại code để phù hợp hơn với mục đích sử dụng của mình
