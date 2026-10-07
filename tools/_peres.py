"""读一个 PE 文件的资源表（只解析到「类型 / 名字 / 语言」三层），不加载、不执行。

用来查 IExpress 打出来的 exe 里到底塞了哪些图标资源 —— 换图标前得知道要删什么。
（不用 LoadLibraryEx：那个会触发本机安全策略，Python 直接崩。）
"""
import struct


class PE:
    def __init__(self, path):
        self.raw = open(path, 'rb').read()
        e = struct.unpack_from('<I', self.raw, 0x3c)[0]
        if self.raw[e:e + 4] != b'PE\0\0':
            raise ValueError('不是 PE 文件')
        self.e = e
        self.nsec = struct.unpack_from('<H', self.raw, e + 6)[0]
        self.sizeopt = struct.unpack_from('<H', self.raw, e + 20)[0]
        self.opt = e + 24
        self.magic = struct.unpack_from('<H', self.raw, self.opt)[0]
        base = self.opt + (96 if self.magic == 0x10b else 112)
        self.res_rva, self.res_size = struct.unpack_from('<II', self.raw, base + 2 * 8)
        self.sec = []
        so = self.opt + self.sizeopt
        for i in range(self.nsec):
            o = so + i * 40
            name = self.raw[o:o + 8].rstrip(b'\0').decode('latin1')
            vsize, va, rawsize, ptr = struct.unpack_from('<IIII', self.raw, o + 8)
            self.sec.append((name, va, vsize, rawsize, ptr))

    def off(self, rva):
        for name, va, vsize, rawsize, ptr in self.sec:
            if va <= rva < va + max(vsize, rawsize, 1):
                return ptr + (rva - va)
        return None

    def walk(self):
        """返回 [(type, name, lang)]，type/name 可能是 int 或 str"""
        out = []
        if not self.res_rva:
            return out
        root = self.off(self.res_rva)
        if root is None:
            return out
        for t, tname, t_is_dir in self._entries(root):
            tkey = tname
            if not t_is_dir:
                continue
            sub = self.off(self.res_rva + t)
            if sub is None:
                continue
            for n, nname, n_is_dir in self._entries(sub):
                if not n_is_dir:
                    continue
                sub2 = self.off(self.res_rva + n)
                if sub2 is None:
                    continue
                for _l, lname, _d in self._entries(sub2):
                    out.append((tkey, nname, lname))
        return out

    def _entries(self, off):
        named, num = struct.unpack_from('<HH', self.raw, off + 12)
        res = []
        for i in range(named + num):
            o = off + 16 + i * 8
            idf, dataoff = struct.unpack_from('<II', self.raw, o)
            if idf & 0x80000000:          # 具名：低位是字符串偏移
                so = self.res_rva + (idf & 0x7FFFFFFF)
                po = self.off(so)
                ln = struct.unpack_from('<H', self.raw, po)[0]
                name = self.raw[po + 2:po + 2 + ln * 2].decode('utf-16-le')
            else:
                name = idf
            res.append((dataoff & 0x7FFFFFFF, name, bool(dataoff & 0x80000000)))
        return res


NAMES = {3: 'RT_ICON', 14: 'RT_GROUP_ICON', 2: 'RT_BITMAP', 24: 'RT_MANIFEST',
         16: 'RT_VERSION', 6: 'RT_STRING', 1: 'RT_CURSOR', 12: 'RT_GROUP_CURSOR'}


def read_resource(pe, rtype, name, lang=None):
    """取出某个资源条目的原始字节（走到 IMAGE_RESOURCE_DATA_ENTRY 那层）"""
    root = pe.off(pe.res_rva)
    for _dt, tname, t_dir in pe._entries(root):
        if tname != rtype or not t_dir:
            continue
        sub = pe.off(pe.res_rva + _dt)
        for _dn, nname, n_dir in pe._entries(sub):
            if nname != name or not n_dir:
                continue
            sub2 = pe.off(pe.res_rva + _dn)
            for doff, lname, l_dir in pe._entries(sub2):
                if lang is not None and lname != lang:
                    continue
                if l_dir:
                    continue
                de = pe.off(pe.res_rva + doff)
                rva, size = struct.unpack_from('<II', pe.raw, de)
                off = pe.off(rva)
                return pe.raw[off:off + size]
    return None


def main(path):
    pe = PE(path)
    print('%s: PE32%s 节数=%d 资源 RVA=0x%x' %
          (path, '' if pe.magic == 0x10b else '+', pe.nsec, pe.res_rva))
    rows = pe.walk()
    kinds = {}
    for t, n, l in rows:
        kinds.setdefault(t, []).append((n, l))
    for t in sorted(kinds, key=lambda x: str(x)):
        label = NAMES.get(t, 'type%s' % t) if isinstance(t, int) else '"%s"' % t
        ns = kinds[t]
        print('  %-16s %d 个: %s' % (label, len(ns), ns[:8]))


if __name__ == '__main__':
    import sys
    main(sys.argv[1] if len(sys.argv) > 1 else 'dist/CETGo-Setup.exe')
