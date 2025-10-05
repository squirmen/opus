import React, { useState, useEffect } from "react";
import { IconFolder, IconPlus, IconTrash, IconEdit, IconToggleLeft, IconToggleRight, IconRefresh, IconCheck, IconX } from "@tabler/icons-react";
import { toast } from "sonner";

interface LibrarySource {
  id: number;
  path: string;
  name: string;
  type: string;
  enabled: boolean;
  lastScanned: number | null;
  fileCount: number;
  createdAt: number;
}

export default function LibrarySourcesManager() {
  const [sources, setSources] = useState<LibrarySource[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  useEffect(() => {
    loadSources();
  }, []);

  const loadSources = async () => {
    setLoading(true);
    try {
      const librarySources = await window.ipc.invoke("getLibrarySources");
      console.log("Loaded sources:", librarySources);
      setSources(librarySources);
    } catch (error) {
      console.error("Failed to load sources:", error);
      toast(
        <div className="flex w-fit items-center gap-2 text-xs">
          <IconX className="text-red-500" stroke={2} size={16} />
          Failed to load library sources
        </div>
      );
    }
    setLoading(false);
  };

  const handleAddSource = async () => {
    const result = await window.ipc.invoke("showOpenDialog", {
      properties: ["openDirectory", "createDirectory"],
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const path = result.filePaths[0];
      const name = path.split("/").pop() || "New Library";

      try {
        await window.ipc.invoke("addLibrarySource", path, name);
        await loadSources();
        toast(
          <div className="flex w-fit items-center gap-2 text-xs">
            <IconCheck className="text-green-400" stroke={2} size={16} />
            Library source added successfully
          </div>
        );
      } catch (error) {
        toast(
          <div className="flex w-fit items-center gap-2 text-xs">
            <IconX className="text-red-500" stroke={2} size={16} />
            {error instanceof Error ? error.message : "Failed to add library source"}
          </div>
        );
      }
    }
  };

  const handleRemoveSource = async (sourceId: number, sourceName: string) => {
    console.log(`Attempting to remove source ${sourceId}: ${sourceName}`);
    if (!window.confirm(`Remove "${sourceName}"? This will delete all songs from this source from your library.`)) {
      return;
    }

    try {
      await window.ipc.invoke("removeLibrarySource", sourceId);
      await loadSources();
      toast(
        <div className="flex w-fit items-center gap-2 text-xs">
          <IconCheck className="text-green-400" stroke={2} size={16} />
          Library source removed
        </div>
      );
    } catch (error) {
      console.error(`Failed to remove source ${sourceId}:`, error);
      toast(
        <div className="flex w-fit items-center gap-2 text-xs">
          <IconX className="text-red-500" stroke={2} size={16} />
          Failed to remove library source
        </div>
      );
    }
  };

  const handleToggleSource = async (sourceId: number, enabled: boolean) => {
    console.log(`Toggling source ${sourceId} from ${enabled} to ${!enabled}`);
    try {
      await window.ipc.invoke("toggleLibrarySource", sourceId, !enabled);
      await loadSources();
    } catch (error) {
      console.error(`Failed to toggle source ${sourceId}:`, error);
      toast(
        <div className="flex w-fit items-center gap-2 text-xs">
          <IconX className="text-red-500" stroke={2} size={16} />
          Failed to toggle library source
        </div>
      );
    }
  };

  const handleRenameSource = async (sourceId: number) => {
    if (editName.trim()) {
      try {
        await window.ipc.invoke("renameLibrarySource", sourceId, editName.trim());
        await loadSources();
        setEditingId(null);
        setEditName("");
      } catch (error) {
        toast(
          <div className="flex w-fit items-center gap-2 text-xs">
            <IconX className="text-red-500" stroke={2} size={16} />
            Failed to rename library source
          </div>
        );
      }
    }
  };

  const handleScanSource = async (sourceId: number) => {
    setScanning(true);
    try {
      await window.ipc.invoke("scanLibrarySources", [sourceId]);
      await loadSources();
      toast(
        <div className="flex w-fit items-center gap-2 text-xs">
          <IconCheck className="text-green-400" stroke={2} size={16} />
          Library source scanned successfully
        </div>
      );
    } catch (error) {
      toast(
        <div className="flex w-fit items-center gap-2 text-xs">
          <IconX className="text-red-500" stroke={2} size={16} />
          Failed to scan library source
        </div>
      );
    }
    setScanning(false);
  };

  const handleScanAll = async () => {
    setScanning(true);
    try {
      await window.ipc.invoke("scanLibrarySources");
      await loadSources();
      toast(
        <div className="flex w-fit items-center gap-2 text-xs">
          <IconCheck className="text-green-400" stroke={2} size={16} />
          All library sources scanned successfully
        </div>
      );
    } catch (error) {
      toast(
        <div className="flex w-fit items-center gap-2 text-xs">
          <IconX className="text-red-500" stroke={2} size={16} />
          Failed to scan library sources
        </div>
      );
    }
    setScanning(false);
  };

  const formatDate = (timestamp: number | null) => {
    if (!timestamp) return "Never";
    return new Date(timestamp).toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="p-4">
        <h3 className="text-lg font-semibold mb-4">Library Sources</h3>
        <div className="text-sm text-gray-500">Loading library sources...</div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Library Sources</h3>
        <div className="flex gap-2">
          <button
            onClick={handleScanAll}
            disabled={scanning}
            className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <IconRefresh stroke={2} className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />
            Scan All
          </button>
          <button
            onClick={handleAddSource}
            className="px-3 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600 flex items-center gap-2"
          >
            <IconPlus stroke={2} className="w-4 h-4" />
            Add Source
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {sources.length === 0 ? (
          <div className="text-sm text-gray-500 text-center py-8">
            No library sources configured. Click "Add Source" to add your first music folder.
          </div>
        ) : (
          sources.map((source) => (
            <div
              key={source.id}
              className={`p-3 rounded-lg border ${
                source.enabled ? "border-gray-300" : "border-gray-200 opacity-50"
              } hover:bg-gray-50 transition-colors`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1">
                  <IconFolder stroke={2} className="w-5 h-5 mt-1 text-gray-500" />
                  <div className="flex-1">
                    {editingId === source.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onBlur={() => handleRenameSource(source.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRenameSource(source.id);
                            if (e.key === "Escape") {
                              setEditingId(null);
                              setEditName("");
                            }
                          }}
                          className="px-2 py-1 text-sm border rounded flex-1"
                          autoFocus
                        />
                      </div>
                    ) : (
                      <div className="font-medium">{source.name}</div>
                    )}
                    <div className="text-xs text-gray-500 mt-1">{source.path}</div>
                    <div className="flex items-center gap-4 text-xs text-gray-500 mt-2">
                      <span>{source.fileCount} files</span>
                      <span>Last scanned: {formatDate(source.lastScanned)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleScanSource(source.id)}
                    disabled={scanning || !source.enabled}
                    className="p-1.5 text-gray-600 hover:text-gray-800 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Rescan this source"
                  >
                    <IconRefresh stroke={2} className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    onClick={() => {
                      setEditingId(source.id);
                      setEditName(source.name);
                    }}
                    className="p-1.5 text-gray-600 hover:text-gray-800"
                    title="Rename source"
                  >
                    <IconEdit stroke={2} className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleToggleSource(source.id, source.enabled)}
                    className="p-1.5 text-gray-600 hover:text-gray-800"
                    title={source.enabled ? "Disable source" : "Enable source"}
                  >
                    {source.enabled ? (
                      <IconToggleRight stroke={2} className="w-4 h-4 text-green-500" />
                    ) : (
                      <IconToggleLeft stroke={2} className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    onClick={() => handleRemoveSource(source.id, source.name)}
                    className="p-1.5 text-red-500 hover:text-red-700"
                    title="Remove source"
                  >
                    <IconTrash stroke={2} className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}