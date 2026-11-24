// 在 Windows Release 构建中隐藏额外的控制台窗口
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    lumina_reader_lib::run()
}
