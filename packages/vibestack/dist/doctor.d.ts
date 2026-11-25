export interface DoctorCheck {
    name: string;
    status: "ok" | "warn" | "fail";
    detail: string;
}
export interface DoctorOptions {
    installDafny?: boolean;
}
export interface DoctorReport {
    ok: boolean;
    checks: DoctorCheck[];
}
export declare function installDafny(): Promise<string>;
export declare function doctor(root: string, options?: DoctorOptions): Promise<DoctorReport>;
export declare function formatDoctorReport(report: DoctorReport): string;
