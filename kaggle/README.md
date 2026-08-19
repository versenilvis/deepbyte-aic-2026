# Notebook Kaggle

| File | Dùng khi |
|---|---|
| `AIC_2026.ipynb` | bản gốc, giữ để đối chiếu |
| `AIC_2026_optimized.ipynb` | **chạy cái này** - cùng engine, bật server nhanh hơn |

## Chạy

Lần lượt từ trên xuống. Cần 2 Kaggle Secret: `GOOGLE_API_KEY` và `CF_TUNNEL_TOKEN`.

Sau cell 11 là server đã lên tại `aic.verse.id.vn`. Cell 12 trở đi chỉ để nghiệm thu
và xuất bài nộp, không cần cho việc bật server.

## Bản optimized khác gì

9 cell chứa tính năng (`analyze_prompt`, `VideoSearchEngine`, tầng task `4d`,
`frame_resolver.py`, `api_server.py`, `submission.py`, xuất ZIP) được chép **nguyên văn**.
Chỉ 4 cell chuẩn bị được viết lại:

| Khâu | Gốc | Optimized |
|---|---|---|
| `pip install` | 2 lần, nối tiếp, cách nhau 7 cell | 1 lần, song song với tải cloudflared |
| `cloudflared` | tải bên trong `serve()`, nằm trên đường găng | tải sẵn ở cell 0 |
| File JSON | đọc 1 luồng khi nạp | 32 luồng làm nóng ở nền, chồng lên lúc tải model |
| Đọc `.npy` | 1 luồng, chờ mạng từng file | 16 luồng đọc trước 8 video, thứ tự giữ nguyên |
| Chạy lại | nạp lại ~17.000 file nhỏ | đọc 4 file index từ cache |
| Copy cục bộ (`4b`) | đọc mạng + ghi đĩa + đọc lại | bỏ, cache thay thế |

## Index có đổi không

Không. Đã chạy cả hai bộ nạp trên cùng dữ liệu rồi so từng bit: `metadata`,
`ocr_to_frame_map`, 3 corpus BM25 và cả 4 ma trận FAISS đều `np.array_equal`.
Đọc từ cache cũng cho kết quả y hệt.

Đo với 240 video, bơm 12 ms độ trễ mỗi file để giả lập ổ mạng (không phải số đo
trên Kaggle thật): gốc 18.0s, optimized lần đầu 2.3s, lần sau đọc cache 0.1s.

## Cache

Ghi vào `/kaggle/working/aic_index_cache` sau lần dựng đầu tiên. Có vân tay dữ liệu
nên đổi dataset là nó tự từ chối và dựng lại.

`/kaggle/working` mất khi đổi phiên. Muốn giữ cache: Save Version -> Output -> attach
thư mục `aic_index_cache` làm dataset. Cell 4c dò `/kaggle/input` trước, rồi mới tới
`/kaggle/working`.

Dựng lại từ đầu: `rm -rf /kaggle/working/aic_index_cache`.

## Chưa nhanh lên được

- Tải BGE-M3 + CLIP (~2.9 GB từ HuggingFace) là bắt buộc ở lần đầu mỗi phiên.
  Chỉ giấu được nó dưới bước làm nóng JSON.
- Dựng BM25 thuần CPU Python. Pickle `doc_freqs` (một dict mỗi frame) còn to và chậm
  hơn dựng lại, nên không cache.
