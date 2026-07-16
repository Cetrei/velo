package com.cetrei.velo

import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.Environment
import androidx.core.content.FileProvider
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File

private const val LOG_PREFIX = "[VELO_UPDATER]"
private const val DOWNLOADED_APK_FILE_NAME = "velo-update.apk"

@CapacitorPlugin(name = "VeloUpdater")
class VeloUpdaterPlugin : Plugin() {

    private var pendingDownloadId: Long = -1
    private var pendingCall: PluginCall? = null

    private val downloadCompleteReceiver =
        object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                val completedId = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1)
                if (completedId != pendingDownloadId) return
                handleDownloadComplete()
            }
        }

    override fun load() {
        super.load()
        val filter = IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(downloadCompleteReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            context.registerReceiver(downloadCompleteReceiver, filter)
        }
    }

    override fun handleOnDestroy() {
        super.handleOnDestroy()
        context.unregisterReceiver(downloadCompleteReceiver)
    }

    @PluginMethod
    fun canRequestInstallPackages(call: PluginCall) {
        val result = JSObject()
        result.put("granted", context.packageManager.canRequestPackageInstalls())
        call.resolve(result)
    }

    @PluginMethod
    fun requestInstallPackagesPermission(call: PluginCall) {
        val intent = Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES)
        intent.data = Uri.parse("package:" + context.packageName)
        activity.startActivity(intent)
        call.resolve()
    }

    @PluginMethod
    fun downloadAndInstall(call: PluginCall) {
        val downloadUrl = call.getString("downloadUrl")
        if (downloadUrl.isNullOrBlank()) {
            call.reject("$LOG_PREFIX downloadUrl is required")
            return
        }

        pendingCall = call
        val destinationFile = resolveDownloadDestination()
        destinationFile.delete()

        val request = DownloadManager.Request(Uri.parse(downloadUrl))
        request.setDestinationUri(Uri.fromFile(destinationFile))
        request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
        request.setTitle("Velo update")
        request.setMimeType("application/vnd.android.package-archive")

        val downloadManager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        pendingDownloadId = downloadManager.enqueue(request)
    }

    private fun resolveDownloadDestination(): File {
        val downloadsDir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
        return File(downloadsDir, DOWNLOADED_APK_FILE_NAME)
    }

    private fun handleDownloadComplete() {
        val call = pendingCall ?: return
        val apkFile = resolveDownloadDestination()

        if (!apkFile.exists()) {
            call.reject("$LOG_PREFIX downloaded APK file is missing after download completed")
            pendingCall = null
            return
        }

        if (!context.packageManager.canRequestPackageInstalls()) {
            call.reject("$LOG_PREFIX install permission not granted, call requestInstallPackagesPermission first")
            pendingCall = null
            return
        }

        val apkUri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", apkFile)
        val installIntent = Intent(Intent.ACTION_VIEW)
        installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive")
        installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)

        activity.startActivity(installIntent)
        call.resolve()
        pendingCall = null
    }
}
