import type { DepartmentCode, ShiftType } from "./types";

type Item = { label: string; required: boolean };

const R = (label: string, required = true): Item => ({ label, required });

export function shiftChecklistTemplate(type: ShiftType, dept: DepartmentCode): Item[] {
  if (dept === "reception") {
    if (type === "morning") {
      return [
        R("Kiểm quỹ đầu ca, đối chiếu BM-02"),
        R("Kiểm chìa khóa, thẻ phòng, chìa xe khách"),
        R("Xem khách đến / đi / chưa đến trên web và đối chiếu PMS"),
        R("Gửi số khách ăn sáng cho bếp"),
        R("Kiểm phòng trống / INS trước khi nhận khách"),
        R("Ghi nhận gửi xe còn tồn ca trước"),
        R("Xem bàn giao ca trước và bấm Đã nhận", true),
      ];
    }
    if (type === "afternoon") {
      return [
        R("Nhận bàn giao ca sáng"),
        R("Chuẩn bị khách đến chiều và check-in"),
        R("Khởi động bộ đếm 30 phút đăng ký lưu trú sau nhận phòng"),
        R("Theo dõi yêu cầu khách chưa xong"),
        R("Chuẩn bị khách đi ngày mai"),
        R("Gửi dự báo ăn sáng ngày mai cho bếp"),
        R("Không kết ca khi còn việc bắt buộc chưa xử lý"),
      ];
    }
    return [
      R("Nhận bàn giao ca chiều"),
      R("Kiểm khách chưa đến / no-show"),
      R("Theo dõi đăng ký lưu trú còn hạn"),
      R("Báo thức, xe đón, ăn sáng sớm"),
      R("An ninh sảnh và chìa khóa"),
      R("Chuẩn bị quỹ và hóa đơn ca sáng"),
    ];
  }
  if (dept === "hk") {
    return [
      R("Nhận danh sách phòng theo ưu tiên"),
      R("Cập nhật trạng thái đang dọn"),
      R("Hoàn tất checklist phòng sạch trước khi chuyển INS"),
      R("Báo hỏng / đồ thất lạc kèm ảnh"),
      R("Báo phòng OOO nếu cần duyệt"),
    ];
  }
  if (dept === "kitchen") {
    return [
      R("Nhận số khách ăn sáng và bấm Đã nhận số"),
      R("Checklist mở bếp / đóng bếp"),
      R("Ghi thực tế khách ăn"),
      R("Báo sự cố thiết bị hoặc ATTP nếu có", false),
    ];
  }
  if (dept === "utility") {
    return [
      R("Checklist setup khu vực công cộng"),
      R("Vệ sinh sảnh / WC"),
      R("Rửa và cất dụng cụ"),
      R("Đóng ca tạp vụ"),
    ];
  }
  return [R("Xem việc quá hạn và sự cố chờ duyệt"), R("Duyệt OOO / sự cố nếu có")];
}
