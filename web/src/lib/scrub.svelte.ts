/**
 * Cờ báo "đang mở clip 5s".
 *
 * Ba nơi cùng nghe phím ← → trên window: trang chính (nhảy candidate trước/sau),
 * lưới kết quả (di con trỏ ô), và thanh tua frame. Khi clip đang mở thì mũi tên
 * phải thuộc về thanh tua - hai nơi kia đọc cờ này để tự bỏ qua.
 */
export const scrub = $state({ active: false });
