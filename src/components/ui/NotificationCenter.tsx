import { motion, AnimatePresence } from "framer-motion";
import { CheckCheck } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { StatusDot } from "./StatusDot";

export function NotificationCenter({ open, onClose }: { open: boolean, onClose: () => void }) {
  const { notifications, markAllNotificationsRead, markNotificationRead } = useApp();

  return (
    <AnimatePresence>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="absolute top-[46px] right-0 w-[400px] bg-bg-base/90 backdrop-blur-md border border-border-subtle rounded-xl shadow-2xl z-50 flex flex-col max-h-[calc(100vh-80px)] overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle shrink-0 bg-bg-base/50">
              <h3 className="font-medium text-text-primary">Notifications</h3>
              <button
                onClick={markAllNotificationsRead}
                className="text-xs flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Mark all as read
              </button>
            </div>

            <div className="overflow-y-auto w-full flex-1 min-h-[200px]">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 text-center text-text-secondary h-full">
                  <div className="w-12 h-12 rounded-full border border-border-subtle bg-bg-elevated flex items-center justify-center mb-2">
                    <CheckCheck className="w-5 h-5 text-text-tertiary" />
                  </div>
                  You're caught up.
                </div>
              ) : (
                <div className="divide-y divide-border-subtle/50">
                  {notifications.map((notif) => (
                    <div
                      key={notif.id}
                      className={`p-4 flex items-start gap-2 transition-colors hover:bg-bg-hover cursor-pointer ${notif.read ? 'opacity-60' : ''}`}
                      onClick={() => markNotificationRead(notif.id)}
                    >
                      <StatusDot status={notif.status} className="mt-2 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start gap-2 mb-2">
                          <h4 className="text-sm font-medium text-text-primary truncate">{notif.title}</h4>
                          <span className="text-[10px] text-text-tertiary whitespace-nowrap pt-2">{notif.time}</span>
                        </div>
                        <p className="text-xs text-text-secondary line-clamp-2">{notif.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
